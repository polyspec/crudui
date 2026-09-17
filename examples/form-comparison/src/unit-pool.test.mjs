import assert from 'node:assert/strict';
import test from 'node:test';

import { measuredLimitMs, runUnit, runUnits } from './unit-pool.mjs';

const sleep = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

test('a unit reports its start, heartbeat and result with its duration', async () => {
  const lines = [];
  const result = await runUnit({ id: 'slow', timeoutMs: 1_000, run: () => sleep(120) },
    { write: text => lines.push(text), heartbeatMs: 40, label: 'check' });
  assert.equal(result.status, 'passed');
  assert.match(lines[0], /^\[check\] slow: started \(timeout 1\.0s\)\n$/);
  assert.ok(lines.some(line => /^\[check\] slow: running \d+ms\n$/.test(line)), lines.join(''));
  assert.match(lines.at(-1), /^\[check\] slow: passed in \d+ms\n$/);
});

test('a unit that outlives its own timeout fails with its id and aborts its action', async () => {
  const lines = [];
  let aborted;
  const started = performance.now();
  const result = await runUnit({
    id: 'stuck', timeoutMs: 80,
    run: signal => new Promise(() => signal.addEventListener('abort', () => { aborted = signal.reason; })),
  }, { write: text => lines.push(text), heartbeatMs: 1_000 });
  assert.equal(result.status, 'timed-out');
  assert.ok(performance.now() - started < 500, 'the timeout does not wait for the action');
  assert.match(aborted.message, /stuck timed out after/);
  assert.match(lines.at(-1), /stuck: timed out after/);
});

test('a failed unit keeps its error and the pool keeps running the others', async () => {
  const results = await runUnits([
    { id: 'a', timeoutMs: 1_000, run: () => { throw new Error('broken'); } },
    { id: 'b', timeoutMs: 1_000, run: () => 'value' },
  ], { concurrency: 1, write: () => {} });
  assert.deepEqual(results.map(result => [result.id, result.status]), [['a', 'failed'], ['b', 'passed']]);
  assert.match(results[0].error, /broken/);
  assert.equal(results[1].value, 'value');
});

test('the pool runs at most its concurrency at a time, in unit order', async () => {
  let active = 0;
  let peak = 0;
  const units = Array.from({ length: 7 }, (_, index) => ({
    id: `unit-${index}`, timeoutMs: 1_000,
    run: async () => { active++; peak = Math.max(peak, active); await sleep(20); active--; return index; },
  }));
  const results = await runUnits(units, { concurrency: 3, write: () => {} });
  assert.equal(peak, 3);
  assert.deepEqual(results.map(result => result.value), [0, 1, 2, 3, 4, 5, 6]);
});

test('every unit requires its own timeout', async () => {
  await assert.rejects(runUnit({ id: 'x', run: () => {} }), /own timeout/);
  await assert.rejects(runUnits([{ id: 'x', timeoutMs: 1, run: () => {} }], {}), /positive concurrency/);
});

test('a unit limit is three times its slowest measurement, rounded up to five seconds, at least ten', () => {
  assert.equal(measuredLimitMs(1), 10_000);
  assert.equal(measuredLimitMs(3_334), 15_000);
  assert.equal(measuredLimitMs(26_347), 80_000);
  assert.throws(() => measuredLimitMs(0), /measured duration/);
});
