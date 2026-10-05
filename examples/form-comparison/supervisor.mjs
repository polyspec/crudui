import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { completeBuild, planBuild, processesToStart, supervisorFiles } from './src/build-targets.mjs';
import { installOrderedJson } from './src/ordered-json-source.mjs';
import { changeRequests } from './src/change-requests.mjs';
import { forwardLines } from './src/process-output.mjs';
import { formatDuration, runStep } from './src/step-runner.mjs';
import {
  binaryDirectory, buildStateFile, cruduiModule, orderedJsonDirectory, publicDirectory, publicServerProcess,
  serverProcess, sourceIdentityFile, sourceMount, stateDirectory, supervisorProcessFile, treeDirectory,
} from './src/server-layout.mjs';
import { stopChild, verifyChildServers, waitForChildReadiness } from './src/server-startup.mjs';
import {
  applyTreeChanges, changedPaths, readTreeState, sourceIdentity, synchronizeTree,
} from './src/source-tree.mjs';

const manifestFile = path.join(stateDirectory, 'tree-manifest.json');
const processes = new Map();
let state = { status: 'building', cycle: 0, source: null, error: null };
let treeState;
let stopping = false;

function log(message) {
  process.stdout.write(`[supervisor] ${message}\n`);
}

/** Hand the state to the public server and replace the build state file in one step. */
function share() {
  processes.get('public')?.child.send(state);
  const temporary = `${buildStateFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state) + '\n');
  renameSync(temporary, buildStateFile);
}

function publish(next) {
  state = { ...state, progress: null, ...next };
  const elapsed = next.durationMs === undefined ? '' : ` in ${formatDuration(next.durationMs)}`;
  log(`cycle ${state.cycle}: ${state.status}${elapsed}${state.error ? ` (${state.error})` : ''}`);
  share();
}

/** Name the step the building cycle runs: its target and its step. */
function reportProgress(target, step) {
  state = { ...state, progress: { target, step, at: Date.now() } };
  share();
}


/** Run one build target: every step streams its progress and runs to its end. */
async function runTarget(target, label) {
  const started = performance.now();
  for (const [index, step] of target.steps.entries()) {
    const id = target.steps.length === 1 ? target.id : `${target.id}-${index + 1}`;
    reportProgress(target.id, id);
    const result = await runStep({ ...step, id }, { label });
    if (result.status !== 'passed') {
      throw new Error(`${id} ${result.status} after ${formatDuration(result.durationMs)}`);
    }
  }
  return performance.now() - started;
}

/** Stop one supervised process: SIGTERM, then SIGKILL for its tree after the termination grace. */
async function stopProcess(name) {
  const entry = processes.get(name);
  if (!entry) return;
  processes.delete(name);
  entry.stopping = true;
  await stopChild(entry.child);
}

async function startProcess(name, cruduiModuleSha256) {
  await stopProcess(name);
  const definition = name === 'public'
    ? publicServerProcess() : serverProcess(name, { cruduiModuleSha256 });
  const child = spawn(definition.command, definition.args, {
    cwd: treeDirectory,
    env: { ...process.env, ...definition.environment },
    stdio: ['ignore', 'pipe', 'pipe', ...(name === 'public' ? ['ipc'] : [])],
  });
  const entry = { child, stopping: false };
  processes.set(name, entry);
  // Each server's output carries its name; every line, warnings included, is kept.
  forwardLines(child.stdout, { prefix: `[${name}] `, write: text => process.stdout.write(text) });
  forwardLines(child.stderr, { prefix: `[${name}] `, write: text => process.stderr.write(text) });
  child.on('exit', (code, signal) => {
    if (entry.stopping || stopping) return;
    processes.delete(name);
    publish({ status: 'failed', error: `${name} exited: ${signal ?? code}` });
  });
  try {
    await waitForChildReadiness(child, { server: name, ...definition.ready });
  } catch (error) {
    // A process that failed before its readiness is not left running.
    await stopProcess(name);
    throw error;
  }
  if (name === 'public') child.send(state);
}

async function writeSourceIdentity(source) {
  const temporary = sourceIdentityFile + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(source, null, 2) + '\n');
  await rename(temporary, sourceIdentityFile);
}

/** Run one build cycle: rebuild the planned targets, restart their processes and verify all. */
async function runCycle(plan, source) {
  publish({ status: 'building', cycle: state.cycle + 1, error: null });
  const startedCycle = performance.now();
  const label = `supervisor cycle ${state.cycle}`;
  try {
    for (const target of plan.targets) {
      const durationMs = await runTarget(target, label);
      log(`cycle ${state.cycle}: built ${target.id} in ${formatDuration(durationMs)}`);
    }
    reportProgress('source', 'source-identity');
    await writeSourceIdentity(source);
    const cruduiModuleSha256 = createHash('sha256').update(await readFile(cruduiModule))
      .digest('hex');
    for (const name of processesToStart(plan.restarts, [...processes.keys()])) {
      reportProgress('restart', name);
      const startedRestart = performance.now();
      await startProcess(name, cruduiModuleSha256);
      log(`cycle ${state.cycle}: restarted ${name} in `
        + `${formatDuration(performance.now() - startedRestart)}`);
    }
    reportProgress('verify', 'child-servers');
    await verifyChildServers({ expected: { source, cruduiModuleSha256 } });
    publish({ status: 'ready', source, durationMs: performance.now() - startedCycle });
  } catch (error) {
    publish({ status: 'failed', source, error: error.message,
      durationMs: performance.now() - startedCycle });
  }
}

async function checkSource() {
  const next = await readTreeState(sourceMount);
  const paths = await changedPaths(sourceMount, treeState, next);
  if (paths.length === 0) return;
  treeState = next;
  const source = await sourceIdentity(sourceMount);
  if (paths.some(file => path.posix.basename(file) === '.gitignore')) {
    await synchronizeTree({ source: sourceMount, tree: treeDirectory, manifestFile });
  } else {
    await applyTreeChanges({ source: sourceMount, tree: treeDirectory, manifestFile, paths });
  }
  log(`changed: ${paths.join(', ')}`);
  const plan = planBuild(paths);
  if (supervisorFiles.some(file => paths.includes(file))) {
    publish({ status: 'building', source, error: null });
    reportProgress('reload', 'stop-processes');
    await reloadSupervisor();
    return;
  }
  await runCycle(plan, source);
}

/**
 * Reload this process from the mounted source without restarting its container or volumes. The
 * supervisor is the only child of the container's init process, so it replaces its own process
 * image and keeps its process id instead of exiting.
 */
async function reloadSupervisor() {
  stopping = true;
  await Promise.all([...processes.keys()].map(stopProcess));
  process.chdir(sourceMount);
  process.execve(process.execPath, [process.execPath,
    path.join(sourceMount, 'examples/form-comparison/supervisor.mjs')], process.env);
}

/**
 * Compare the mounted repository at every change event. File events of the host do not reach the
 * container through the VM file share, so the host's source watcher (source-events.mjs) signals
 * this process with SIGUSR2 for every change of the working tree. A signal during a comparison
 * makes one more comparison after it; no comparison runs on a timer.
 */
const comparisons = changeRequests(async () => {
  try {
    await checkSource();
  } catch (error) {
    publish({ status: 'failed', error: error.message });
  }
});
let comparing = false;
let changedDuringStart = false;
process.on('SIGUSR2', () => {
  log('source change signalled');
  if (comparing) comparisons.request();
  else changedDuringStart = true;
});

async function shutdown() {
  stopping = true;
  await Promise.all([...processes.keys()].map(stopProcess));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/** Run one startup step and report what it did with its elapsed time. */
async function startupStep(id, action) {
  const started = performance.now();
  log(`start: ${id} started`);
  reportProgress('start', id);
  const value = await action();
  log(`start: ${id} finished in ${formatDuration(performance.now() - started)}`);
  return value;
}

await Promise.all([treeDirectory, publicDirectory, binaryDirectory, stateDirectory]
  .map(directory => mkdir(directory, { recursive: true })));
// The signal handler is installed above, so a change signalled after this record is not lost.
writeFileSync(`${supervisorProcessFile}.${process.pid}.tmp`, `${process.pid}\n`);
renameSync(`${supervisorProcessFile}.${process.pid}.tmp`, supervisorProcessFile);
await startupStep('ordered-json-sources', () => installOrderedJson(orderedJsonDirectory));
treeState = await readTreeState(sourceMount);
const initialSource = await sourceIdentity(sourceMount);
await startupStep('build-tree', () =>
  synchronizeTree({ source: sourceMount, tree: treeDirectory, manifestFile }));
await runCycle(completeBuild(), initialSource);
comparing = true;
log('start: waiting for source change signals');
if (changedDuringStart) comparisons.request();
