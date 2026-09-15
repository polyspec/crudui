import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { completeBuild, planBuild, supervisorFiles } from './src/build-targets.mjs';
import { installOrderedJson } from './src/ordered-json-source.mjs';
import { forwardLines, isPhpAccessLogLine } from './src/process-output.mjs';
import { formatDuration, runStep } from './src/step-runner.mjs';
import {
  binaryDirectory, cruduiModule, orderedJsonDirectory, publicDirectory, publicServerProcess,
  serverProcess, sourceIdentityFile, sourceMount, stateDirectory, treeDirectory,
} from './src/server-layout.mjs';
import { verifyChildServers, waitForChildReadiness } from './src/server-startup.mjs';
import {
  applyTreeChanges, changedPaths, readTreeState, sourceIdentity, synchronizeTree,
} from './src/source-tree.mjs';

// File events from the host do not reach a Linux container through the VM file share, so the
// mounted repository is compared with Git once per interval.
const checkInterval = 1_000;
const manifestFile = path.join(stateDirectory, 'tree-manifest.json');
const processes = new Map();
let state = { status: 'building', cycle: 0, source: null, error: null };
let treeState;
let stopping = false;

function log(message) {
  process.stdout.write(`[supervisor] ${message}\n`);
}

function publish(next) {
  state = { ...state, ...next };
  const elapsed = next.durationMs === undefined ? '' : ` in ${formatDuration(next.durationMs)}`;
  log(`cycle ${state.cycle}: ${state.status}${elapsed}${state.error ? ` (${state.error})` : ''}`);
  processes.get('public')?.child.send(state);
}

/** Run one build target: every step streams its progress and holds the target's timeout. */
async function runTarget(target, label) {
  const started = performance.now();
  for (const [index, step] of target.steps.entries()) {
    const id = target.steps.length === 1 ? target.id : `${target.id}-${index + 1}`;
    const result = await runStep({ ...step, id, timeoutMs: target.timeoutMs }, { label });
    if (result.status !== 'passed') {
      throw new Error(`${id} ${result.status} after ${formatDuration(result.durationMs)}`);
    }
  }
  return performance.now() - started;
}

async function stopProcess(name) {
  const entry = processes.get(name);
  if (!entry) return;
  processes.delete(name);
  entry.stopping = true;
  if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
  const exited = new Promise(resolve => entry.child.once('exit', resolve));
  entry.child.kill('SIGTERM');
  await exited;
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
  // Each server's output carries its name. The PHP built-in server's two access lines per
  // request are dropped; its warnings and every other message are kept.
  const drop = name === 'php' || name === 'php-ext' ? isPhpAccessLogLine : undefined;
  forwardLines(child.stdout, { prefix: `[${name}] `, drop, write: text => process.stdout.write(text) });
  forwardLines(child.stderr, { prefix: `[${name}] `, drop, write: text => process.stderr.write(text) });
  child.on('exit', (code, signal) => {
    if (entry.stopping || stopping) return;
    processes.delete(name);
    publish({ status: 'failed', error: `${name} exited: ${signal ?? code}` });
  });
  await waitForChildReadiness(child, { server: name, ...definition.ready });
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
    await writeSourceIdentity(source);
    const cruduiModuleSha256 = createHash('sha256').update(await readFile(cruduiModule))
      .digest('hex');
    for (const name of plan.restarts) {
      const startedRestart = performance.now();
      await startProcess(name, cruduiModuleSha256);
      log(`cycle ${state.cycle}: restarted ${name} in `
        + `${formatDuration(performance.now() - startedRestart)}`);
    }
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
    await reloadSupervisor();
    return;
  }
  await runCycle(plan, source);
}

/** Reload this process from the mounted source without restarting its container or volumes. */
async function reloadSupervisor() {
  stopping = true;
  await Promise.all([...processes.keys()].map(stopProcess));
  const child = spawn(process.execPath, [path.join(sourceMount, 'examples/form-comparison/supervisor.mjs')], {
    cwd: sourceMount, env: process.env, stdio: 'inherit', detached: true,
  });
  child.unref();
  process.exit(0);
}

async function watchSource() {
  while (!stopping) {
    try {
      await checkSource();
    } catch (error) {
      publish({ status: 'failed', error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}

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
  const value = await action();
  log(`start: ${id} finished in ${formatDuration(performance.now() - started)}`);
  return value;
}

await Promise.all([treeDirectory, publicDirectory, binaryDirectory, stateDirectory]
  .map(directory => mkdir(directory, { recursive: true })));
await startupStep('ordered-json-sources', () => installOrderedJson(orderedJsonDirectory));
treeState = await readTreeState(sourceMount);
const initialSource = await sourceIdentity(sourceMount);
await startupStep('build-tree', () =>
  synchronizeTree({ source: sourceMount, tree: treeDirectory, manifestFile }));
await runCycle(completeBuild(), initialSource);
await watchSource();
