// The teardown of a test file or a test: a browser close, a server stop, a directory removal. A
// teardown is a long operation, not a test case: it has no hook timeout and ends when its
// operation settles (the close resolved, the process exited), and its result or error decides it.
// It prints its start, a line while it is still running and its end with the elapsed time.
import { after } from 'node:test';

const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)}s`;

/**
 * Register one teardown as an `after` hook without a time limit.
 * @param {string} name what the teardown stops, such as `browser close`
 * @param {() => unknown} operation
 * @param {object} [options]
 * @param {{ after: Function }} [options.context] the test whose `after` hook runs the teardown;
 *   without it, the teardown runs after every test of the file
 * @param {(text: string) => void} [options.write]
 * @param {number} [options.heartbeatMs] interval of the still-running lines
 */
export function teardown(name, operation, { context, write = text => process.stdout.write(text), heartbeatMs = 5000 } = {}) {
  const register = context ? context.after.bind(context) : after;
  register(async () => {
    const started = performance.now();
    const elapsed = () => seconds(performance.now() - started);
    write(`[teardown] ${name}: started\n`);
    const running = setInterval(() => write(`[teardown] ${name}: still running (${elapsed()})\n`), heartbeatMs);
    try {
      await operation();
      write(`[teardown] ${name}: finished in ${elapsed()}\n`);
    } catch (error) {
      write(`[teardown] ${name}: failed after ${elapsed()}: ${error?.message ?? error}\n`);
      throw error;
    } finally {
      clearInterval(running);
    }
  }, { timeout: Infinity });
}
