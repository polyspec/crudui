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
  formatDuration, runStages, stepHeartbeatMs, stopStepsOnSignal,
} from './src/step-runner.mjs';
import { verifyEvidence } from './verification-evidence.mjs';

const example = path.join(treeDirectory, 'examples/form-comparison');
/** One check of the verification: a step that runs to its end and prints its progress. */
function check(id, args) {
  return { id, command: 'node', args, cwd: example, environment: {} };
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
 * A check is a long operation: it runs to its end without a time limit and prints its progress;
 * the units inside the pipeline and browser checks keep their own limits. The four browser checks
 * run at the same time: each one drives its own browser process with its own focus, selection and
 * scroll, and each server keeps its own records, so no measurement of one reaches another.
 */
export function verificationStages() {
  return [
    [check('php-modes', ['test-php-modes.mjs', orderedJsonModule, cruduiModule, treeDirectory])],
    [check('generation', ['check-generation.mjs', '--url', publicOrigin,
      '--library', treeDirectory, '--report', path.join(resultsDirectory, 'generation.json')])],
    [check('persistence', ['check-servers.mjs'])],
    [check('pipeline', ['check-pipeline.mjs', '--origin', publicOrigin,
      '--report', path.join(resultsDirectory, 'pipeline.json')])],
    formServers.map(server => check(`browser-${server}`, ['check.mjs', server, publicOrigin])),
    [check('browser-summary', ['check-browser-reports.mjs',
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
 * Call `onChange` at every replacement of `file`, which the supervisor replaces by renaming a new
 * file over it, and `onError` when the file cannot be watched. The watch is on the file itself,
 * whose registration is complete when `watch` returns (kqueue on macOS, inotify on Linux); a
 * directory watch on macOS starts its event stream later and can miss a replacement made right
 * after it starts. A replacement ends the watch of the replaced file, so every event first watches
 * the current file and then calls `onChange`, whose read sees every replacement made before that
 * watch. Returns the function that stops watching.
 */
export function watchStateFile(file, onChange, onError) {
  let watcher;
  let stopped = false;
  const arm = () => {
    watcher?.close();
    try {
      watcher = watch(file, () => {
        if (stopped) return;
        arm();
        onChange();
      });
    } catch (error) {
      stopped = true;
      return onError(error);
    }
    watcher.on('error', error => { if (!stopped) onError(error); });
  };
  arm();
  return () => {
    stopped = true;
    watcher?.close();
  };
}

/**
 * Wait for the current build cycle to be ready. The supervisor replaces its build state file at
 * every change; while a cycle builds, `progress` names the target and the step it runs. The wait
 * reads the file once at its start and again at every replacement of the file; it reads nothing on
 * a timer. Waiting for a build is a long operation, so the wait has no time limit: it ends when the
 * state of this source is `ready`, and fails when a cycle fails or the file cannot be watched, read
 * or parsed. A ready build of another source than `source` is not the build waited for: the
 * supervisor has not yet taken the checkout, and the wait goes on. It prints every new step it
 * reads and, every heartbeat, a line with its elapsed time and the state it last read. `clock`,
 * `watch` and `read` replace the system clock, the file watch and the file read.
 */
export function readyBuild({
  source, stateFile = buildStateFile, heartbeatMs = stepHeartbeatMs,
  write = text => process.stdout.write(text),
  clock = systemClock, watch: watchState = watchStateFile, read = file => readFile(file, 'utf8'),
} = {}) {
  const prefix = '[verification] build-readiness:';
  return new Promise((resolve, reject) => {
    const started = clock.now();
    const elapsed = () => formatDuration(clock.now() - started);
    write(`${prefix} started\n`);
    let reading = 'no answer yet';
    let done = false;
    let timer;
    let stopWatching = () => {};
    const end = () => {
      done = true;
      clock.clearTimer(timer);
      stopWatching();
    };
    const fail = (status, message) => {
      if (done) return;
      end();
      write(`${prefix} ${status} after ${elapsed()}: ${message}\n`);
      reject(new Error(`build-readiness ${status} after ${elapsed()}: ${message}`));
    };
    // A progress line every heartbeat; the timer decides nothing.
    const heartbeat = () => {
      if (done) return;
      write(`${prefix} running ${elapsed()} (${reading})\n`);
      timer = clock.setTimer(heartbeat, heartbeatMs);
    };
    const observe = state => {
      if (state.status === 'ready' && sameSourceIdentity(state.source, source)) {
        end();
        write(`${prefix} passed in ${elapsed()}\n`);
        write(`${prefix} cycle ${state.cycle} is ready\n`);
        return resolve(state);
      }
      if (state.status === 'failed') return fail('failed', `cycle ${state.cycle} failed (${state.error})`);
      let next;
      if (state.status === 'ready') {
        next = `cycle ${state.cycle} is ready for ${JSON.stringify(state.source)}, not ${JSON.stringify(source)}`;
      } else {
        assert.equal(state.status, 'building', `Unknown build status ${state.status}`);
        const progress = state.progress ?? {};
        next = `cycle ${state.cycle} building ${progress.target} step ${progress.step}`;
      }
      if (next !== reading) write(`${prefix} ${next}\n`);
      reading = next;
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
          return fail('failed', `cannot read ${stateFile}: ${error.message}`);
        }
        if (done) return;
        try {
          observe(state);
        } catch (error) {
          end();
          reject(error);
        }
      });
    };
    try {
      stopWatching = watchState(stateFile, load, error => fail('failed', `cannot watch ${stateFile}: ${error.message}`));
    } catch (error) {
      return fail('failed', `cannot watch ${stateFile}: ${error.message}`);
    }
    timer = clock.setTimer(heartbeat, heartbeatMs);
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
