// The units and the long operations of a browser check or a pipeline. A unit is a node:test test with its own
// timeout (`unitTest`), which records its outcome and duration for the report. A long operation inside such a check (a
// browser launch or close) has no node:test equivalent, so `runOperation` runs it without a limit and prints its start,
// its elapsed time at every heartbeat and its result. `measuredLimitMs` sets a unit's limit from its measurement.
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDuration, stepHeartbeatMs } from './step-runner.mjs';

/** The value of a passed outcome and the error text of a failed one, the part of a result that follows its timing. */
function resultPayload(outcome) {
  return {
    ...(outcome.status === 'passed' && outcome.value !== undefined ? { value: outcome.value } : {}),
    ...(outcome.status === 'failed' ? { error: String(outcome.error?.stack ?? outcome.error) } : {}),
  };
}

/**
 * Register one unit as a node:test test with its own timeout. Its action receives the test's AbortSignal, which aborts
 * when the timeout ends the test, so the action must release what it holds then. The outcome of the unit (`passed`,
 * `failed` or `timed-out`) is pushed to `results` with its duration and its timeout; `skipWhen` returns the reason to
 * skip the unit, or undefined to run it.
 */
export function unitTest(results, { id, timeoutMs, run, skipWhen = () => undefined }) {
  assert.match(id ?? '', /^[a-z0-9][a-z0-9/-]*$/, 'A unit requires a lowercase id');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, `${id}: every unit requires its own timeout`);
  assert.equal(typeof run, 'function', `${id}: a unit requires an action`);
  test(id, { timeout: timeoutMs }, async t => {
    const reason = skipWhen();
    if (reason !== undefined) {
      t.skip(reason);
      return;
    }
    const started = performance.now();
    let recorded = false;
    const record = outcome => {
      if (recorded) return;
      recorded = true;
      results.push({ id, durationMs: performance.now() - started, timeoutMs, ...outcome });
    };
    // The signal aborts when the timeout ends the test; a unit that is still running then is timed out.
    t.signal.addEventListener('abort', () => {
      const elapsed = formatDuration(performance.now() - started);
      record({
        status: 'timed-out',
        error: `${id} ran ${elapsed} and exceeded its ${formatDuration(timeoutMs)} timeout`,
      });
    }, { once: true });
    try {
      const value = await run(t.signal);
      record({ status: 'passed', ...(value === undefined ? {} : { value }) });
    } catch (error) {
      record({ status: 'failed', ...resultPayload({ status: 'failed', error }) });
      throw error;
    }
  });
}

/**
 * Run one long operation (a browser launch, a browser close) to its end without a time limit. It prints a start line,
 * a line with its elapsed time at every heartbeat, and its result line; its result or error decides it.
 */
export async function runOperation({ id, run }, options = {}) {
  assert.match(id ?? '', /^[a-z0-9][a-z0-9/-]*$/, 'An operation requires a lowercase id');
  assert.equal(typeof run, 'function', `${id}: an operation requires an action`);
  const write = options.write ?? (text => process.stdout.write(text));
  const heartbeatMs = options.heartbeatMs ?? stepHeartbeatMs;
  const label = options.label ?? 'operation';
  const started = performance.now();
  const elapsed = () => formatDuration(performance.now() - started);
  write(`[${label}] ${id}: started\n`);
  const heartbeat = setInterval(() => write(`[${label}] ${id}: running ${elapsed()}\n`), heartbeatMs);
  const outcome = await Promise.resolve().then(run).then(
    value => ({ status: 'passed', value }),
    error => ({ status: 'failed', error }),
  );
  clearInterval(heartbeat);
  const durationMs = performance.now() - started;
  write(`[${label}] ${id}: ${outcome.status === 'passed' ? `passed in ${formatDuration(durationMs)}`
    : `failed after ${formatDuration(durationMs)}: ${outcome.error?.stack ?? outcome.error}`}\n`);
  return { id, status: outcome.status, durationMs, ...resultPayload(outcome) };
}

/**
 * The limit of a unit from its slowest measured duration: three times the measurement, rounded up
 * to five seconds, and at least ten seconds, so that a loaded machine stays inside it while a hung
 * unit still fails within a bounded time.
 */
export function measuredLimitMs(measuredMs) {
  assert.ok(Number.isFinite(measuredMs) && measuredMs > 0, 'A unit limit requires a measured duration');
  return Math.max(10_000, Math.ceil(3 * measuredMs / 5_000) * 5_000);
}
