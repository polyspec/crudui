// Run one command of a long operation (a build, a documentation tool, a declared test command, a
// benchmark driver) to its end. The command has no time limit: its exit ends it and its status
// decides the result. It starts in its own process group; when it exits, the processes it leaves
// behind in that group are stopped, so a process that keeps an output pipe open cannot hold the
// caller. When the caller is interrupted, its running commands stop with it. The result carries
// the elapsed time, which the caller prints with the command's outcome.
import { spawn } from 'node:child_process';

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const groups = new Set();

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
 * @param {'inherit' | 'pipe'} [options.stdout] `pipe` collects the output into the result
 * @param {'inherit' | 'pipe'} [options.stderr]
 * @returns {Promise<{ status: number | null, signal: string | null, stdout: string, stderr: string,
 *   elapsedMs: number, stopped?: 'output', error?: Error }>}
 */
export function runCommand({ command, args = [], cwd, env = process.env, stdout = 'inherit', stderr = 'inherit' }) {
  const started = performance.now();
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', stdout, stderr], detached: true });
    const output = { stdout: '', stderr: '' };
    let bytes = 0, stopped, exit, done = false;
    const finish = result => {
      if (done) return;
      done = true;
      if (child.pid !== undefined) untrack(child.pid);
      resolve({ ...output, elapsedMs: performance.now() - started, stopped, status: null, signal: null, ...result });
    };
    if (child.pid !== undefined) track(child.pid);
    for (const name of ['stdout', 'stderr']) {
      child[name]?.setEncoding('utf8').on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_OUTPUT_BYTES) {
          if (!stopped) signalGroup(child.pid, 'SIGKILL');
          stopped = 'output';
          return;
        }
        output[name] += chunk;
      });
    }
    child.once('error', error => finish({ error }));
    // The command's exit is its end: the processes it left in its group are stopped, which closes
    // every output pipe they hold, and the result follows the close of the output.
    child.once('exit', (status, signal) => {
      exit = { status, signal };
      signalGroup(child.pid, 'SIGKILL');
    });
    child.once('close', (status, signal) => finish(exit ?? { status, signal }));
  });
}

/** The failure of a finished command in one line, or undefined when it succeeded. */
export function failureOf(result) {
  if (result.stopped === 'output') return `wrote more than ${MAX_OUTPUT_BYTES} bytes; stopped its process group`;
  if (result.error) return result.error.message;
  if (result.status !== 0) return result.status === null ? `ended by ${result.signal}` : `failed with status ${result.status}`;
  return undefined;
}
