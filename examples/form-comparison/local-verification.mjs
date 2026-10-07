// The verification of the form comparison against one local stack built from this checkout
// (docs/spec/form-comparison.md, "Local verification"): the record servers run as local processes
// on ports of 127.0.0.1 that the system assigns, the checks run against them in stages, the
// evidence is checked, and the servers stop. Usage:
//   node examples/form-comparison/local-verification.mjs [--results /absolute/results]
// Without `--results` the reports go to a directory of the run under the system temporary
// directory, which is removed after a passing run and kept, with its path printed, after a failure.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { exampleDirectory, repositoryRoot, startLocalStack } from './src/local-servers.mjs';
import { formServers } from './src/runtime-paths.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import { sourceIdentity } from './src/source-tree.mjs';
import { formatDuration, runStages, stopStepsOnSignal } from './src/step-runner.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';
import { verifyEvidence } from './verification-evidence.mjs';

/** One check of the verification: a step that runs to its end and prints its progress. */
function check(id, args, environment = {}) {
  return { id, command: process.execPath, args, cwd: exampleDirectory, environment };
}

/**
 * Every check of one verification run against the local stack at `origin`, in execution order.
 * The steps of one stage run at the same time. A check is a long operation: it runs to its end
 * without a time limit and prints its progress; the units inside the pipeline and browser checks
 * keep their own limits. The four browser checks run at the same time: each drives its own browser
 * process and its own server's records. The typing check edits the PHP records of the frames, so
 * it runs after them.
 */
export function verificationStages({ origin, results, data, prepared, library = repositoryRoot }) {
  const resultsEnvironment = { FORM_COMPARISON_RESULTS: results };
  return [
    [check('php-modes', ['test-php-modes.mjs', prepared.orderedJsonModule, prepared.cruduiModule, library])],
    [check('generation', ['check-generation.mjs', '--url', origin,
      '--library', library, '--report', path.join(results, 'generation.json')])],
    [check('persistence', ['check-servers.mjs', '--origin', origin, '--data', data,
      '--report', path.join(results, 'server-report.json')])],
    [check('pipeline', ['check-pipeline.mjs', '--origin', origin,
      '--report', path.join(results, 'pipeline.json')])],
    formServers.map(server => check(`browser-${server}`, ['check.mjs', server, origin], resultsEnvironment)),
    [check('browser-summary', ['check-browser-reports.mjs',
      '--results', results, '--origin', origin,
      '--source', path.join(results, 'source.json'),
      '--report', path.join(results, 'browser-summary.json')])],
    [check('typing', ['check-typing.mjs', origin], resultsEnvironment)],
  ];
}

async function main() {
  stopStepsOnSignal();
  const { values } = parseArgs({ options: { results: { type: 'string' } } });
  assert.ok(values.results === undefined || path.isAbsolute(values.results), '--results must be an absolute path');
  const startedAt = new Date().toISOString();
  const startedClock = performance.now();
  const root = await mkdtemp(path.join(tmpdir(), 'crudui-verification-'));
  const results = values.results ?? path.join(root, 'results');
  await mkdir(results, { recursive: true });
  for (const entry of await readdir(results)) await rm(path.join(results, entry), { recursive: true, force: true });
  const processes = [];
  // Every stage step is one test of the shared progress lines; a stage with a failed step ends the run.
  const lines = createProgress({ write: text => process.stdout.write(text) });
  let passed = false;
  try {
    lines.start('local stack', { group: true });
    let stack;
    try {
      stack = await startLocalStack({ root, processes });
    } catch (error) {
      lines.fail('local stack', undefined, error.message);
      throw error;
    }
    lines.pass('local stack');
    await writeFile(path.join(results, 'source.json'), JSON.stringify(stack.source, null, 2) + '\n');
    const checks = [];
    for (const stage of verificationStages({
      origin: stack.origin, results, data: stack.dataDirectory, prepared: stack.prepared,
    })) {
      for (const step of stage) lines.start(step.id);
      const stageResults = await runStages([stage], { label: 'verification' });
      for (const result of stageResults) {
        if (result.status === 'passed') lines.pass(result.id, result.durationMs);
        else lines.fail(result.id, result.durationMs, `${result.id} ${result.status}`);
      }
      checks.push(...stageResults);
      if (stageResults.some(result => result.status !== 'passed')) break;
    }
    process.stdout.write(`[verification] checks: ${checks.map(result =>
      `${result.id} ${result.status} ${formatDuration(result.durationMs)}`).join(', ')}\n`);
    const failed = checks.find(result => result.status !== 'passed');
    if (failed) throw new Error(`Verification check ${failed.id} ${failed.status} after ${formatDuration(failed.durationMs)}`);
    lines.start('evidence');
    const after = await sourceIdentity(repositoryRoot);
    assert.ok(sameSourceIdentity(after, stack.source), 'The repository changed during verification; verify it again');
    let evidence;
    try {
      evidence = await verifyEvidence(results);
    } catch (error) {
      lines.fail('evidence', undefined, error.message);
      throw error;
    }
    lines.pass('evidence');
    const durationMs = performance.now() - startedClock;
    await writeFile(path.join(results, 'verification.json'), JSON.stringify({
      source: stack.source, startedAt, completedAt: new Date().toISOString(), durationMs, passed: true, checks, evidence,
    }, null, 2) + '\n');
    process.stdout.write(`Verification passed for ${JSON.stringify(stack.source)} in ${formatDuration(durationMs)}: `
      + `${evidence.generation.results} generation, ${evidence.persistence.results} persistence, `
      + `${evidence.pipeline.combinations} canonical flow, ${evidence.browser.checks} browser and `
      + `${evidence.typing.results} typing results\n`);
    passed = true;
  } finally {
    await Promise.all(processes.map(running => running.stop()));
    lines.close('verification', { exitCode: passed ? 0 : 1, requireTests: true });
    if (passed) await rm(root, { recursive: true, force: true });
    else process.stderr.write(`[verification] the reports of this run remain in ${results}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
