import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
/** A running step prints one line with its elapsed time at this interval. */
export const stepHeartbeatMs = 15_000;
/** A stopped step's process tree gets this long to exit after SIGTERM before SIGKILL. */
export const stepTerminationGraceMs = 5_000;

/** Format a duration for progress lines: `850ms`, `42.1s`, `3m04s`. */
export function formatDuration(milliseconds) {
  assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0, 'Duration must be a finite value');
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

/** Select one process and every descendant from a `pid ppid` process table. */
export function processTree(rootPid, table) {
  const children = new Map();
  for (const { pid, ppid } of table) {
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const result = [];
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.shift();
    if (result.includes(pid)) continue;
    result.push(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return result;
}

async function processTable() {
  const { stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=', '-o', 'ppid=']);
  return stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
    .map(([pid, ppid]) => ({ pid, ppid }));
}

function signal(pid, name) {
  try {
    process.kill(pid, name);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

/**
 * Stop one step's whole process tree: its process group and every descendant, which a
 * descendant that left the group (Chromium's helpers) would otherwise survive.
 */
export async function killProcessTree(child, graceMs = stepTerminationGraceMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  const tree = processTree(child.pid, await processTable());
  signal(-child.pid, 'SIGTERM');
  for (const pid of tree) signal(pid, 'SIGTERM');
  let timer;
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), graceMs); }),
  ]);
  clearTimeout(timer);
  // Descendants may outlive the leader, so the recorded tree is killed either way.
  const remaining = processTree(child.pid, await processTable().catch(() => []));
  for (const pid of new Set([...tree, ...remaining])) signal(pid, 'SIGKILL');
  signal(-child.pid, 'SIGKILL');
  if (!graceful) await exited;
}

function prefixLines(stream, prefix, write, onLine) {
  let pending = '';
  stream.setEncoding('utf8');
  function emit(line) {
    write(`${prefix}${line}\n`);
    onLine(line);
  }
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) emit(line);
  });
  return new Promise(resolve => stream.once('end', () => {
    if (pending) emit(pending);
    resolve();
  }));
}

/** Validate one step definition: an id, a command and its own timeout. */
export function assertStep(step) {
  assert.match(step?.id ?? '', /^[a-z0-9][a-z0-9-]*$/, 'A step requires a lowercase id');
  assert.equal(typeof step.command, 'string', `${step.id}: a step requires a command`);
  assert.ok(Array.isArray(step.args), `${step.id}: a step requires arguments`);
  assert.ok(Number.isSafeInteger(step.timeoutMs) && step.timeoutMs > 0,
    `${step.id}: every step requires its own timeout`);
  return step;
}

const running = new Set();

/**
 * Run one step and stream its progress: a start line, a line with the elapsed time at every
 * heartbeat while it runs, its output prefixed with its id, and a pass, fail or timeout line with
 * its duration. A step that reaches its timeout has its whole process tree killed.
 */
export async function runStep(step, options = {}) {
  assertStep(step);
  const write = options.write ?? (text => process.stdout.write(text));
  const heartbeatMs = options.heartbeatMs ?? stepHeartbeatMs;
  const label = options.label ?? 'step';
  const started = performance.now();
  const elapsed = () => formatDuration(performance.now() - started);
  write(`[${label}] ${step.id}: started (timeout ${formatDuration(step.timeoutMs)})\n`);
  const child = spawn(step.command, step.args, {
    cwd: step.cwd, env: { ...process.env, ...step.environment },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const entry = { child, step };
  running.add(entry);
  const onLine = options.onLine ?? (() => {});
  const output = Promise.all([
    prefixLines(child.stdout, `[${step.id}] `, write, onLine),
    prefixLines(child.stderr, `[${step.id}] `, write, onLine),
  ]);
  let timedOut = false;
  const heartbeat = setInterval(() => write(`[${label}] ${step.id}: running ${elapsed()}\n`),
    heartbeatMs);
  const timeout = setTimeout(() => {
    timedOut = true;
    write(`[${label}] ${step.id}: timeout after ${elapsed()}; killing its process tree\n`);
    killProcessTree(child).catch(error => write(`[${label}] ${step.id}: ${error.message}\n`));
  }, step.timeoutMs);
  const [code, signalName, error] = await new Promise(resolve => {
    child.once('error', failure => resolve([null, null, failure]));
    child.once('exit', (exitCode, exitSignal) => resolve([exitCode, exitSignal, null]));
  });
  clearInterval(heartbeat);
  clearTimeout(timeout);
  running.delete(entry);
  if (!error) await output;
  const durationMs = performance.now() - started;
  const status = timedOut ? 'timed-out' : code === 0 ? 'passed' : 'failed';
  const detail = timedOut ? `timed out after ${formatDuration(durationMs)}`
    : status === 'passed' ? `passed in ${formatDuration(durationMs)}`
      : `failed (${error?.message ?? signalName ?? `exit ${code}`}) after ${formatDuration(durationMs)}`;
  write(`[${label}] ${step.id}: ${detail}\n`);
  return { id: step.id, status, exitCode: code, signal: signalName, durationMs,
    timeoutMs: step.timeoutMs };
}

/**
 * Run stages in order; the steps of one stage run at the same time. The run stops after the
 * first stage with a step that did not pass, and every result records its duration.
 */
export async function runStages(stages, options = {}) {
  const results = [];
  for (const stage of stages) {
    assert.ok(Array.isArray(stage) && stage.length > 0, 'A stage requires one or more steps');
    stage.forEach(assertStep);
    const stageResults = await Promise.all(stage.map(step => runStep(step, options)));
    results.push(...stageResults);
    if (stageResults.some(result => result.status !== 'passed')) break;
  }
  return results;
}

/** Stop every running step's process tree when this process is asked to stop. */
export function stopStepsOnSignal({ write = text => process.stderr.write(text) } = {}) {
  for (const name of ['SIGTERM', 'SIGINT']) {
    process.once(name, async () => {
      write(`${name}: stopping ${running.size} running step(s)\n`);
      await Promise.all([...running].map(({ child }) => killProcessTree(child, 1_000)));
      process.exit(name === 'SIGINT' ? 130 : 143);
    });
  }
}
