// The canonical flow check against one running origin: the deployed service (tree verification)
// or a local stack. Usage:
//   node check-pipeline.mjs --origin http://127.0.0.1:8080 --report /results/pipeline.json
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';

import {
  pipelineCombinations, pipelineConcurrency, pipelineResetUnits, pipelineUnitLimitMs,
  pipelineUnits,
} from './src/pipeline-flow.mjs';
import { browserUnitLimitsMs } from './browser-report-policy.mjs';
import { recordServers } from './src/record-contract.mjs';
import { assertSourceIdentity } from './src/source-identity.mjs';
import { formatDuration } from './src/step-runner.mjs';
import { runUnits } from './src/unit-pool.mjs';

/** Summarize the unit results of one run. */
export function pipelineReport({ origin, source, resets, combinations, startedAt, durationMs }) {
  const expected = pipelineCombinations().map(({ id }) => id);
  const failed = [...resets, ...combinations].filter(result => result.status !== 'passed');
  const passedCombinations = combinations.filter(result => result.status === 'passed').length;
  return {
    generatedAt: new Date().toISOString(), startedAt, durationMs, origin, source,
    servers: [...recordServers], total: expected.length, passedCombinations, failed: failed.length,
    passed: failed.length === 0 && resets.length === recordServers.length
      && JSON.stringify(combinations.map(({ id }) => id)) === JSON.stringify(expected),
    resets, combinations,
  };
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: 'string' }, report: { type: 'string' } }, strict: true });
  const origin = new URL(values.origin ?? '');
  assert.ok(['http:', 'https:'].includes(origin.protocol) && origin.pathname === '/' && !origin.search,
    'Usage: node check-pipeline.mjs --origin <http-origin> --report <absolute-file>');
  assert.ok(path.isAbsolute(values.report ?? ''), 'The report must be an absolute path');
  const write = text => process.stdout.write(text);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const source = assertSourceIdentity(await (await fetch(new URL('/source.json', origin))).json());
  write(`[pipeline] ${pipelineCombinations().length} combinations, ${pipelineConcurrency} at a time, `
    + `${formatDuration(pipelineUnitLimitMs)} each\n`);
  let browser;
  const [launch] = await runUnits([{
    id: 'browser-start', timeoutMs: browserUnitLimitsMs['browser-start'],
    run: async () => { browser = await puppeteer.launch({ headless: true, protocolTimeout: pipelineUnitLimitMs }); },
  }], { concurrency: 1, label: 'pipeline', write });
  assert.equal(launch.status, 'passed', 'The browser did not start');
  for (const name of ['SIGTERM', 'SIGINT']) {
    process.once(name, () => {
      write(`[pipeline] ${name}: closing the browser\n`);
      browser.close().catch(() => {}).finally(() => process.exit(name === 'SIGINT' ? 130 : 143));
    });
  }
  let report;
  try {
    const resets = await runUnits(pipelineResetUnits(origin), { concurrency: recordServers.length, label: 'pipeline', write });
    const combinations = resets.every(result => result.status === 'passed')
      ? await runUnits(pipelineUnits({ browser, origin }), { concurrency: pipelineConcurrency, label: 'pipeline', write })
      : [];
    report = pipelineReport({ origin: origin.href, source, resets, combinations, startedAt, durationMs: performance.now() - started });
  } finally {
    await runUnits([{ id: 'browser-close', timeoutMs: browserUnitLimitsMs['browser-close'], run: () => browser.close() }],
      { concurrency: 1, label: 'pipeline', write });
  }
  await mkdir(path.dirname(values.report), { recursive: true });
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
  const resetFailures = report.resets.filter(result => result.status !== 'passed').length;
  write(`[pipeline] ${report.passedCombinations}/${report.total} combinations passed, `
    + `${resetFailures} of ${report.resets.length} store resets failed, in ${formatDuration(report.durationMs)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
