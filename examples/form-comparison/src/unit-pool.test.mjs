import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { measuredLimitMs, runOperation } from './unit-pool.mjs';

test('a unit is a node:test test that records its passed, failed and timed-out outcomes', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'unit-pool-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const poolUrl = new URL('./unit-pool.mjs', import.meta.url).href;
  const outcomes = path.join(directory, 'outcomes.json');
  // The fixture runs three units under node:test; its failing and timed-out units fail the fixture's own run, so the
  // run's exit status is not read: the outcomes it records are.
  const fixture = path.join(directory, 'units.test.mjs');
  await writeFile(fixture, `import { writeFileSync } from 'node:fs';
import { after } from 'node:test';
import { unitTest } from ${JSON.stringify(poolUrl)};

const results = [];
unitTest(results, { id: 'passing', timeoutMs: 1_000, run: () => 'value' });
unitTest(results, { id: 'failing', timeoutMs: 1_000, run: () => { throw new Error('broken'); } });
unitTest(results, { id: 'stuck', timeoutMs: 80, run: () => new Promise(() => {}) });
unitTest(results, { id: 'skipped', timeoutMs: 1_000, run: () => 'never', skipWhen: () => 'an earlier unit failed' });
after(() => writeFileSync(${JSON.stringify(outcomes)}, JSON.stringify(results)));
`);
  // A run of node:test sets NODE_TEST_CONTEXT for its children, which would make the fixture's own run a child report.
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  spawnSync(process.execPath, ['--test', fixture], { encoding: 'utf8', env: environment });
  const recorded = JSON.parse(await readFile(outcomes, 'utf8'));
  assert.deepEqual(recorded.map(result => [result.id, result.status]),
    [['passing', 'passed'], ['failing', 'failed'], ['stuck', 'timed-out']]);
  assert.equal(recorded[0].value, 'value');
  assert.match(recorded[1].error, /broken/);
  assert.match(recorded[2].error, /^stuck ran \d+ms and exceeded its 80ms timeout$/);
  for (const result of recorded) assert.equal(typeof result.durationMs, 'number', `${result.id}: its duration`);
});

test('a unit limit is three times its slowest measurement, rounded up to five seconds, at least ten', () => {
  assert.equal(measuredLimitMs(1), 10_000);
  assert.equal(measuredLimitMs(3_334), 15_000);
  assert.equal(measuredLimitMs(26_347), 80_000);
  assert.throws(() => measuredLimitMs(0), /measured duration/);
});

test('an operation has no limit and reports its start, heartbeat and result', async () => {
  const lines = [];
  // The operation ends only after it has seen its first heartbeat line.
  let heard;
  const heartbeat = new Promise(resolve => { heard = resolve; });
  const result = await runOperation({ id: 'browser-start', run: async () => { await heartbeat; return 'browser'; } },
    { write: text => { lines.push(text); if (/running/.test(text)) heard(); }, heartbeatMs: 10, label: 'check' });
  assert.deepEqual([result.status, result.value, result.timeoutMs], ['passed', 'browser', undefined]);
  assert.match(lines[0], /^\[check\] browser-start: started\n$/);
  assert.ok(lines.some(line => /^\[check\] browser-start: running \d+ms\n$/.test(line)), lines.join(''));
  assert.match(lines.at(-1), /^\[check\] browser-start: passed in \d+ms\n$/);
  const failed = await runOperation({ id: 'browser-close', run: () => { throw new Error('close refused'); } }, { write: () => {} });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /close refused/);
});
