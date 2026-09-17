// In-process units with their own limits: a check that consists of independent units (the
// pipeline combinations, the phases of a browser check, the build readiness wait) runs each one
// with its own timeout and reports its start, its elapsed time every heartbeat and its result
// with the duration. No limit covers a whole run; the step that runs such a check is stopped when
// it reports no progress (step-runner.mjs).
import assert from 'node:assert/strict';

import { formatDuration, stepHeartbeatMs } from './step-runner.mjs';

/** Validate one unit: an id, its own positive timeout and its action. */
export function assertUnit(unit) {
  assert.match(unit?.id ?? '', /^[a-z0-9][a-z0-9/-]*$/, 'A unit requires a lowercase id');
  assert.ok(Number.isSafeInteger(unit.timeoutMs) && unit.timeoutMs > 0, `${unit.id}: every unit requires its own timeout`);
  assert.equal(typeof unit.run, 'function', `${unit.id}: a unit requires an action`);
  return unit;
}

/**
 * Run one unit. Its action receives an AbortSignal that aborts at the unit's timeout; the unit
 * then fails as timed out without waiting for the action, which must release what it holds when
 * the signal aborts.
 */
export async function runUnit(unit, options = {}) {
  assertUnit(unit);
  const write = options.write ?? (text => process.stdout.write(text));
  const heartbeatMs = options.heartbeatMs ?? stepHeartbeatMs;
  const label = options.label ?? 'unit';
  const started = performance.now();
  const elapsed = () => formatDuration(performance.now() - started);
  write(`[${label}] ${unit.id}: started (timeout ${formatDuration(unit.timeoutMs)})\n`);
  const controller = new AbortController();
  const heartbeat = setInterval(() => write(`[${label}] ${unit.id}: running ${elapsed()}\n`), heartbeatMs);
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort(new Error(`${unit.id} timed out after ${elapsed()}`));
      resolve({ status: 'timed-out' });
    }, unit.timeoutMs);
  });
  const action = Promise.resolve().then(() => unit.run(controller.signal)).then(
    value => ({ status: 'passed', value }),
    error => ({ status: 'failed', error }),
  );
  const outcome = await Promise.race([action, timeout]);
  clearInterval(heartbeat);
  clearTimeout(timer);
  const durationMs = performance.now() - started;
  const detail = outcome.status === 'passed' ? `passed in ${formatDuration(durationMs)}`
    : outcome.status === 'timed-out' ? `timed out after ${formatDuration(durationMs)}`
      : `failed after ${formatDuration(durationMs)}: ${outcome.error?.stack ?? outcome.error}`;
  write(`[${label}] ${unit.id}: ${detail}\n`);
  return {
    id: unit.id, status: outcome.status, durationMs, timeoutMs: unit.timeoutMs,
    ...(outcome.status === 'passed' && outcome.value !== undefined ? { value: outcome.value } : {}),
    ...(outcome.status === 'failed' ? { error: String(outcome.error?.stack ?? outcome.error) } : {}),
  };
}

/** Run units with at most `concurrency` at a time; results keep the order of the units. */
export async function runUnits(units, { concurrency, ...options } = {}) {
  assert.ok(Number.isSafeInteger(concurrency) && concurrency > 0, 'A unit pool requires a positive concurrency');
  units.forEach(assertUnit);
  const results = new Array(units.length);
  let next = 0;
  async function worker() {
    while (next < units.length) {
      const index = next++;
      results[index] = await runUnit(units[index], options);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, worker));
  return results;
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
