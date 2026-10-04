import assert from 'node:assert/strict';
import { watch } from 'node:fs';
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

/** The clock of the build readiness wait: the current time and one-shot timers. */
export const systemClock = {
  now: () => performance.now(),
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: timer => clearTimeout(timer),
};

/**
 * Call `onChange` at every change in the directory of `file`, where the supervisor replaces the
 * file by renaming a new one over it, and `onError` when the directory cannot be watched. Returns
 * the function that stops watching.
 */
export function watchDirectoryOf(file, onChange, onError) {
  const watcher = watch(path.dirname(file), () => onChange());
  watcher.on('error', onError);
  return () => watcher.close();
}

/**
 * Wait for the current build cycle to be ready. The supervisor replaces its build state file at
 * every change. While a cycle builds, `progress` names the step it runs (its target, its step and
 * the limit the step holds) and `progress.at` is renewed every heartbeat. The wait reads the file
 * once at its start and again at every change event of its directory; it reads nothing on a
 * timer. The two parts of the state are checked apart:
 *
 * - progress is the step: one step may last its own limit plus the inactivity limit, the margin
 *   in which the supervisor stops it and moves on. A renewed heartbeat never extends a step.
 * - the heartbeat shows that the supervisor is alive: a `progress.at` that is not renewed within
 *   the inactivity limit, a missing file or a stopped supervisor stops the wait.
 *
 * A timer runs only at the next moment one of these limits ends or a progress line is due, so a
 * limit only turns a missing state into a failure. The wait therefore has no total limit, and no
 * step holds it longer than that step's own limit. A ready build of another source than `source`
 * is not the build waited for: the supervisor has not yet taken the checkout, and the wait goes on
 * under the same inactivity limit. `clock`, `watch` and `read` replace the system clock, the
 * directory watch and the file read.
 */
export function readyBuild({
  source, stateFile = buildStateFile, silenceLimitMs = stepSilenceLimitMs, heartbeatMs = stepHeartbeatMs,
  write = text => process.stdout.write(text),
  clock = systemClock, watch: watchState = watchDirectoryOf, read = file => readFile(file, 'utf8'),
} = {}) {
  const prefix = '[verification] build-readiness:';
  return new Promise((resolve, reject) => {
    const started = clock.now();
    const elapsed = () => formatDuration(clock.now() - started);
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
    let done = false;
    let timer;
    let stopWatching = () => {};
    const end = () => {
      done = true;
      clock.clearTimer(timer);
      stopWatching();
    };
    const stop = (status, message) => {
      if (done) return;
      end();
      write(`${prefix} ${status} after ${elapsed()}: ${message}\n`);
      reject(new Error(`build-readiness ${status} after ${elapsed()}: ${message}`));
    };
    // Apply the limits at the current time and set the timer to the next moment one ends or a
    // progress line is due.
    const check = () => {
      if (done) return;
      const now = clock.now();
      if (now - aliveAt >= silenceLimitMs) {
        return stop('stalled', `no supervisor heartbeat for ${formatDuration(now - aliveAt)} (${reading})`);
      }
      if (now - stepAt >= stepLimitMs + silenceLimitMs) {
        return stop('stalled', `${stepName} exceeded its limit of ${formatDuration(stepLimitMs)} by `
          + `${formatDuration(now - stepAt - stepLimitMs)} (${reading})`);
      }
      if (now - printedAt >= heartbeatMs) {
        printedAt = now;
        write(`${prefix} running ${elapsed()} (${reading})\n`);
      }
      clock.clearTimer(timer);
      const next = Math.min(aliveAt + silenceLimitMs, stepAt + stepLimitMs + silenceLimitMs, printedAt + heartbeatMs);
      timer = clock.setTimer(check, next - now);
    };
    const observe = state => {
      if (state.status === 'ready' && sameSourceIdentity(state.source, source)) {
        end();
        write(`${prefix} passed in ${elapsed()}\n`);
        write(`${prefix} cycle ${state.cycle} is ready\n`);
        return resolve(state);
      }
      if (state.status === 'failed') return stop('failed', `cycle ${state.cycle} failed (${state.error})`);
      const now = clock.now();
      if (state.status === 'ready') {
        reading = `cycle ${state.cycle} is ready for ${JSON.stringify(state.source)}, not ${JSON.stringify(source)}`;
      } else {
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
      return check();
    };
    // Reads run one after another, so the states are observed in the order of the events.
    let reads = Promise.resolve();
    const load = () => {
      reads = reads.then(async () => {
        if (done) return;
        let state;
        try {
          state = JSON.parse(await read(stateFile));
        } catch (error) {
          reading = error.message;
        }
        if (done) return;
        try {
          if (state) observe(state);
          else check();
        } catch (error) {
          end();
          reject(error);
        }
      });
    };
    try {
      stopWatching = watchState(stateFile, load, error => stop('failed', `cannot watch ${stateFile}: ${error.message}`));
    } catch (error) {
      return stop('failed', `cannot watch ${stateFile}: ${error.message}`);
    }
    check();
    load();
  });
}

async function main() {
  stopStepsOnSignal();
  const startedAt = new Date().toISOString();
  const startedClock = performance.now();
  assert.equal(process.argv.length, 3, 'Usage: node verify-tree.mjs {source identity JSON}');
  const before = await readyBuild({ source: JSON.parse(process.argv[2]) });
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
  const after = await readyBuild({ source: before.source });
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
