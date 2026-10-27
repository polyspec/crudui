// The canonical flow check against one running local stack, as one stage of the local verification
// (local-verification.mjs), which runs it with `node --test check-pipeline.mjs`. The environment names the stack's origin
// (FORM_PIPELINE_ORIGIN, an http origin) and the absolute file of the report (FORM_PIPELINE_REPORT). Each store reset and
// each combination is a node:test test with its own timeout (src/unit-pool.mjs); the browser starts and closes as
// operations without a limit.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe } from 'node:test';
import puppeteer from 'puppeteer';

import {
  pipelineConcurrency, pipelineCombinations, pipelineReport, pipelineResetUnits, pipelineUnitLimitMs, pipelineUnits,
} from './src/pipeline-flow.mjs';
import { recordServers } from './src/record-contract.mjs';
import { assertSourceIdentity } from './src/source-identity.mjs';
import { formatDuration } from './src/step-runner.mjs';
import { runOperation, unitTest } from './src/unit-pool.mjs';

const origin = new URL(process.env.FORM_PIPELINE_ORIGIN ?? '');
assert.ok(['http:', 'https:'].includes(origin.protocol) && origin.pathname === '/' && !origin.search,
  'Expected FORM_PIPELINE_ORIGIN to be an HTTP origin');
const reportFile = process.env.FORM_PIPELINE_REPORT ?? '';
assert.ok(path.isAbsolute(reportFile), 'FORM_PIPELINE_REPORT must be an absolute path');
const write = text => process.stdout.write(text);
const startedAt = new Date().toISOString();
const started = performance.now();
const results = { resets: [], combinations: [] };
const source = assertSourceIdentity(await (await fetch(new URL('/source.json', origin))).json());
const combinationCount = pipelineCombinations().length;
write(`[pipeline] ${combinationCount} combinations, ${pipelineConcurrency} at a time, `
  + `${formatDuration(pipelineUnitLimitMs)} each\n`);
// Starting and closing Chromium are long operations without a limit.
const launch = await runOperation({
  id: 'browser-start', run: () => puppeteer.launch({ headless: true, protocolTimeout: pipelineUnitLimitMs }),
}, { label: 'pipeline', write });
assert.equal(launch.status, 'passed', `The browser did not start: ${launch.error}`);
const browser = launch.value;
for (const name of ['SIGTERM', 'SIGINT']) {
  process.once(name, () => {
    write(`[pipeline] ${name}: closing the browser\n`);
    browser.close().catch(error => write(`[pipeline] ${name}: closing the browser failed: ${error}\n`)).finally(() => process.exit(name === 'SIGINT' ? 130 : 143));
  });
}

describe('store resets', { concurrency: recordServers.length, timeout: Infinity }, () => {
  for (const unit of pipelineResetUnits(origin)) unitTest(results.resets, unit);
});

// The combinations run only when every store reset passed, as the report requires.
const resetsPassed = () => results.resets.every(result => result.status === 'passed')
  ? undefined : 'a store reset did not pass';
describe('canonical flow', { concurrency: pipelineConcurrency, timeout: Infinity }, () => {
  for (const unit of pipelineUnits({ browser, origin })) {
    unitTest(results.combinations, { ...unit, skipWhen: resetsPassed });
  }
});

after(async () => {
  try {
    const report = pipelineReport({
      origin: origin.href, source, resets: results.resets, combinations: results.combinations,
      startedAt, durationMs: performance.now() - started,
    });
    await mkdir(path.dirname(reportFile), { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
    const resetFailures = report.resets.filter(result => result.status !== 'passed').length;
    write(`[pipeline] ${report.passedCombinations}/${report.total} combinations passed, `
      + `${resetFailures} of ${report.resets.length} store resets failed, in ${formatDuration(report.durationMs)}\n`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    const closed = await runOperation({ id: 'browser-close', run: () => browser.close() }, { label: 'pipeline', write });
    if (closed.status !== 'passed') process.exitCode = 1;
  }
});
