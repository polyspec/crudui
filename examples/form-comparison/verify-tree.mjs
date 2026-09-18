import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formServers } from './src/runtime-paths.mjs';
import {
  buildStateFile, cruduiModule, orderedJsonModule, publicOrigin, resultsDirectory, treeDirectory,
} from './src/server-layout.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import {
  formatDuration, runStages, stepHeartbeatMs, stepSilenceLimitMs, stopStepsOnSignal,
} from './src/step-runner.mjs';
import { verifyEvidence } from './verification-evidence.mjs';

const example = path.join(treeDirectory, 'examples/form-comparison');
/** A single operation with a total limit. */
function check(id, timeoutMs, command, args, cwd = example, environment = {}) {
  return { id, timeoutMs, command, args, cwd, environment };
}

/**
 * A check made of units, each with its own limit: it has no total limit and is stopped when it
 * prints no unit progress line within the inactivity limit.
 */
function unitCheck(id, args) {
  return { id, silenceLimitMs: stepSilenceLimitMs, command: 'node', args, cwd: example, environment: {} };
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
 * - `pipeline` drives the canonical List → Detail → Form → Save → List flow of the deployed page
 *   for all 40 server, client and initialization combinations;
 * - the browser checks drive the built frame pages in the container's Chromium;
 * - `browser-summary` aggregates the four browser reports of this run.
 *
 * A single operation carries its own timeout, sized from its measured duration. The pipeline and
 * browser checks consist of units with their own limits and carry only the inactivity limit. The
 * four browser checks
 * run at the same time: each one drives its own browser process with its own focus, selection and
 * scroll, and each server keeps its own records, so no measurement of one reaches another.
 */
export function verificationStages() {
  return [
    // Measured on the idle deployment: php-modes 1 s, generation 7 s, persistence 2 s.
    // Each limit leaves an order of magnitude for a loaded machine.
    [check('php-modes', 60_000, 'node',
      ['test-php-modes.mjs', orderedJsonModule, cruduiModule, treeDirectory])],
    [check('generation', 120_000, 'node', ['check-generation.mjs', '--url', publicOrigin,
      '--library', treeDirectory, '--report', path.join(resultsDirectory, 'generation.json')])],
    [check('persistence', 60_000, 'node', ['check-servers.mjs'])],
    [unitCheck('pipeline', ['check-pipeline.mjs', '--origin', publicOrigin,
      '--report', path.join(resultsDirectory, 'pipeline.json')])],
    formServers.map(server => unitCheck(`browser-${server}`, ['check.mjs', server, publicOrigin])),
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

/**
 * Wait for the current build cycle to be ready. The supervisor replaces its build state file at
 * every change. While a cycle builds, `progress` names the step it runs (its target, its step and
 * the limit the step holds) and `progress.at` is renewed every heartbeat. The two are checked
 * apart:
 *
 * - progress is the step: one step may last its own limit plus the inactivity limit, the margin
 *   in which the supervisor stops it and moves on. A renewed heartbeat never extends a step.
 * - the heartbeat shows that the supervisor is alive: a `progress.at` that is not renewed within
 *   the inactivity limit, a missing file or a stopped supervisor stops the wait.
 *
 * The wait therefore has no total limit, and no step holds it longer than that step's own limit.
 */
export async function readyBuild({
  stateFile = buildStateFile, silenceLimitMs = stepSilenceLimitMs, pollMs = 1_000,
  heartbeatMs = stepHeartbeatMs,
  write = text => process.stdout.write(text),
} = {}) {
  const prefix = '[verification] build-readiness:';
  const started = performance.now();
  const elapsed = () => formatDuration(performance.now() - started);
  write(`${prefix} started (inactivity limit ${formatDuration(silenceLimitMs)})\n`);
  // The current step, when it started and the limit it holds.
  let step;
  let stepAt = started;
  let stepLimitMs = 0;
  let stepName = 'no step';
  // The last heartbeat and when it was seen.
  let alive;
  let aliveAt = started;
  let printedAt = started;
  let reading = 'no answer yet';
  const stop = (status, message) => {
    write(`${prefix} ${status} after ${elapsed()}: ${message}\n`);
    throw new Error(`build-readiness ${status} after ${elapsed()}: ${message}`);
  };
  for (;;) {
    let state;
    try {
      state = JSON.parse(await readFile(stateFile, 'utf8'));
    } catch (error) {
      reading = error.message;
    }
    if (state?.status === 'ready') {
      write(`${prefix} passed in ${elapsed()}\n`);
      write(`${prefix} cycle ${state.cycle} is ready\n`);
      return state;
    }
    if (state?.status === 'failed') {
      stop('failed', `cycle ${state.cycle} failed (${state.error})`);
    }
    const now = performance.now();
    if (state) {
      assert.equal(state.status, 'building', `Unknown build status ${state.status}`);
      const progress = state.progress ?? {};
      reading = `cycle ${state.cycle} building ${progress.target} step ${progress.step}`;
      // A state without a step holds no limit of its own: it may last the inactivity limit.
      const identity = JSON.stringify([state.cycle, progress.target, progress.step]);
      if (identity !== step) {
        step = identity;
        stepAt = now;
        stepLimitMs = progress.limitMs ?? 0;
        stepName = `step ${progress.step} of ${progress.target}`;
      }
      if (progress.at !== alive) {
        alive = progress.at;
        aliveAt = now;
      }
    }
    if (now - aliveAt >= silenceLimitMs) {
      stop('stalled', `no supervisor heartbeat for ${formatDuration(now - aliveAt)} (${reading})`);
    }
    if (now - stepAt >= stepLimitMs + silenceLimitMs) {
      stop('stalled', `${stepName} exceeded its limit of ${formatDuration(stepLimitMs)} by `
        + `${formatDuration(now - stepAt - stepLimitMs)} (${reading})`);
    }
    if (now - printedAt >= heartbeatMs) {
      printedAt = now;
      write(`${prefix} running ${elapsed()} (${reading})\n`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

async function main() {
  stopStepsOnSignal();
  const startedAt = new Date().toISOString();
  const startedClock = performance.now();
  const before = await readyBuild();
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
