import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formServers } from './src/runtime-paths.mjs';
import {
  cruduiModule, orderedJsonModule, publicOrigin, resultsDirectory, treeDirectory,
} from './src/server-layout.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import { formatDuration, runStages, stopStepsOnSignal } from './src/step-runner.mjs';
import { verifyEvidence } from './verification-evidence.mjs';

const example = path.join(treeDirectory, 'examples/form-comparison');
/**
 * The current build cycle is read once. A cycle that is still building answers when it finishes,
 * so this limit covers one complete build of every target, measured at 58 seconds.
 */
export const buildReadinessLimitMs = 600_000;

function check(id, timeoutMs, command, args, cwd = example, environment = {}) {
  return { id, timeoutMs, command, args, cwd, environment };
}

/**
 * Every check of one verification run, in execution order, against the running build. The steps
 * of one stage run at the same time.
 *
 * Verification covers the deployed services alone. The host and CI run the source suite, the Go
 * server tests, the Rust server tests and the ordered JSON tests before a deployment, and those
 * tests read no build output of this container, so repeating them here would verify nothing this
 * run does not already cover. Each kept check needs the running build:
 *
 * - `php-modes` loads the `crudui.so` and `ordered_json.so` this container built;
 * - `generation` and `persistence` request the four running API servers;
 * - the browser checks drive the built frame pages in the container's Chromium;
 * - `browser-summary` aggregates the four browser reports of this run.
 *
 * Every step carries its own timeout, sized from its measured duration. The four browser checks
 * run at the same time: each one drives its own browser process with its own focus, selection and
 * scroll, and each server keeps its own records, so no measurement of one reaches another.
 */
export function verificationStages() {
  return [
    // Measured on the idle deployment: php-modes 1 s, generation 7 s, persistence 2 s,
    // one browser check 284 s. Each limit leaves an order of magnitude for a loaded machine.
    [check('php-modes', 60_000, 'node',
      ['test-php-modes.mjs', orderedJsonModule, cruduiModule, treeDirectory])],
    [check('generation', 120_000, 'node', ['check-generation.mjs', '--url', publicOrigin,
      '--library', treeDirectory, '--report', path.join(resultsDirectory, 'generation.json')])],
    [check('persistence', 60_000, 'node', ['check-servers.mjs'])],
    formServers.map(server =>
      check(`browser-${server}`, 1_200_000, 'node', ['check.mjs', server, publicOrigin])),
    [check('browser-summary', 120_000, 'node', ['check-browser-reports.mjs',
      '--results', resultsDirectory, '--origin', publicOrigin,
      '--source', path.join(resultsDirectory, 'source.json'),
      '--report', path.join(resultsDirectory, 'browser-summary.json')])],
  ];
}

/** Every check of one verification run in execution order. */
export function verificationChecks() {
  return verificationStages().flat();
}

/** Wait for the supervisor's current build cycle to finish and require it to be ready. */
function readyBuild() {
  return new Promise((resolve, reject) => {
    // The supervisor answers when the cycle is no longer building; a first build takes minutes.
    const request = http.get(publicOrigin + '/api/source', response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {
          const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          assert.ok(response.statusCode === 200 && state.status === 'ready',
            `The build is not ready: ${state.status}${state.error ? ` (${state.error})` : ''}`);
          resolve(state);
        } catch (error) { reject(error); }
      });
      response.on('error', reject);
    }).on('error', reject);
    request.setTimeout(buildReadinessLimitMs, () => request.destroy(new Error(
      `The build cycle did not finish within ${buildReadinessLimitMs} ms`)));
  });
}

async function main() {
  stopStepsOnSignal();
  const startedAt = new Date().toISOString();
  const startedClock = performance.now();
  process.stdout.write(`[verification] build readiness: waiting at most `
    + `${formatDuration(buildReadinessLimitMs)}\n`);
  const before = await readyBuild();
  process.stdout.write(`[verification] build readiness: cycle ${before.cycle} ready in `
    + `${formatDuration(performance.now() - startedClock)}\n`);
  await mkdir(resultsDirectory, { recursive: true });
  for (const entry of await readdir(resultsDirectory)) {
    await rm(path.join(resultsDirectory, entry), { recursive: true, force: true });
  }
  await writeFile(path.join(resultsDirectory, 'source.json'),
    JSON.stringify(before.source, null, 2) + '\n');
  const checks = await runStages(verificationStages(), { label: 'verification' });
  const failed = checks.find(result => result.status !== 'passed');
  const durations = checks.map(result =>
    `${result.id} ${formatDuration(result.durationMs)}`).join(', ');
  process.stdout.write(`[verification] checks: ${durations}\n`);
  if (failed) {
    throw new Error(`Verification check ${failed.id} ${failed.status} after `
      + `${formatDuration(failed.durationMs)}`);
  }
  const after = await readyBuild();
  assert.ok(after.cycle === before.cycle && sameSourceIdentity(after.source, before.source),
    'The repository changed during verification; verify it again');
  const evidence = await verifyEvidence(resultsDirectory);
  const durationMs = performance.now() - startedClock;
  await writeFile(path.join(resultsDirectory, 'verification.json'), JSON.stringify({
    source: before.source, cycle: before.cycle, startedAt, completedAt: new Date().toISOString(),
    durationMs, passed: true, checks, evidence,
  }, null, 2) + '\n');
  process.stdout.write(`Verification passed for ${JSON.stringify(before.source)} in `
    + `${formatDuration(durationMs)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
