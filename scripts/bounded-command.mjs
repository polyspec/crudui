// Run one command with a time limit. The command starts in its own process group, so at the limit
// the whole group stops: a wrapper such as npm, go run, cargo run or /bin/sh and every process it
// started. The group first receives SIGTERM, and SIGKILL once the command ends or after a short
// grace, so a process that ignores SIGTERM does not survive. Processes the command leaves behind
// when it ends normally are stopped the same way. The result carries the elapsed time, which the
// caller prints with the command's outcome.
//
// CRUDUI_COMMAND_LIMIT_SECONDS replaces the limit a caller declares, for a slower machine or a
// check that needs a short limit.
import { spawn } from 'node:child_process';

const LIMIT_VARIABLE = 'CRUDUI_COMMAND_LIMIT_SECONDS';
const GRACE_MS = 2_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const groups = new Set();

/** The limit of a command in milliseconds: the caller's own, or the one the environment sets. */
export function commandLimitMs(defaultSeconds, environment = process.env) {
  const value = environment[LIMIT_VARIABLE];
  if (value === undefined || value === '') return defaultSeconds * 1000;
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new Error(`${LIMIT_VARIABLE} must be a whole number of seconds from 1 to 999999`);
  return Number(value) * 1000;
}

export const formatSeconds = milliseconds => `${(milliseconds / 1000).toFixed(1)}s`;

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    // ESRCH: no process of the group is left. EPERM: only exited processes remain in it.
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
  }
}

// An interrupted or ending caller takes its running commands with it.
function stopAll() {
  for (const pid of groups) signalGroup(pid, 'SIGKILL');
}
const onSignal = signal => {
  stopAll();
  process.exit(signal === 'SIGINT' ? 130 : 143);
};
function track(pid) {
  if (groups.size === 0) {
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('exit', stopAll);
  }
  groups.add(pid);
}
function untrack(pid) {
  groups.delete(pid);
  if (groups.size === 0) {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('exit', stopAll);
  }
}

/**
 * @param {object} options
 * @param {string} options.command
 * @param {string[]} [options.args]
 * @param {string} [options.cwd]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {number} options.limitMs
 * @param {'inherit' | 'pipe'} [options.stdout] `pipe` collects the output into the result
 * @param {'inherit' | 'pipe'} [options.stderr]
 * @returns {Promise<{ status: number | null, signal: string | null, stdout: string, stderr: string,
 *   elapsedMs: number, stopped?: 'limit' | 'output', error?: Error }>}
 */
export function runBounded({ command, args = [], cwd, env = process.env, limitMs, stdout = 'inherit', stderr = 'inherit' }) {
  if (!Number.isSafeInteger(limitMs) || limitMs <= 0) throw new TypeError('A command needs a positive limit in milliseconds');
  const started = performance.now();
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', stdout, stderr], detached: true });
    const output = { stdout: '', stderr: '' };
    let bytes = 0, stopped, grace, done = false;
    const stop = reason => {
      if (stopped) return;
      stopped = reason;
      signalGroup(child.pid, 'SIGTERM');
      grace = setTimeout(() => signalGroup(child.pid, 'SIGKILL'), GRACE_MS);
    };
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(grace);
      if (child.pid !== undefined) {
        signalGroup(child.pid, 'SIGKILL');
        untrack(child.pid);
      }
      resolve({ ...output, elapsedMs: performance.now() - started, stopped, status: null, signal: null, ...result });
    };
    if (child.pid !== undefined) track(child.pid);
    for (const name of ['stdout', 'stderr']) {
      child[name]?.setEncoding('utf8').on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_OUTPUT_BYTES) return stop('output');
        output[name] += chunk;
      });
    }
    const timer = setTimeout(() => stop('limit'), limitMs);
    child.once('error', error => finish({ error }));
    child.once('close', (status, signal) => finish({ status, signal }));
  });
}

/** The failure of a finished command in one line, or undefined when it succeeded. */
export function failureOf(result, limitMs) {
  if (result.stopped === 'limit') return `exceeded its ${formatSeconds(limitMs).replace(/\.0s$/, 's')} limit; stopped its process group after ${formatSeconds(result.elapsedMs)}`;
  if (result.stopped === 'output') return `wrote more than ${MAX_OUTPUT_BYTES} bytes; stopped its process group`;
  if (result.error) return result.error.message;
  if (result.status !== 0) return result.status === null ? `ended by ${result.signal}` : `failed with status ${result.status}`;
  return undefined;
}
