import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBrowserJob, createBrowserJob } from './browser-job.mjs';

test('starts the matrix without waiting for all reports', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const job = createBrowserJob(async ({ report }) => {
    await report('corrected/react/form', async () => {
      await blocked;
      return { server: 'php-ext', mode: 'corrected', framework: 'react', transport: 'form' };
    });
    await report('corrected/react/json', async () => ({
      server: 'php-ext', mode: 'corrected', framework: 'react', transport: 'json',
    }));
    return { source: 'verified' };
  }, { totalReports: 2 });

  const started = job.start();
  assert.equal(started.status, 'running');
  assert.equal(started.completedReports, 0);
  assert.equal(started.totalReports, 2);
  assert.equal(started.current, 'corrected/react/form');
  assert.equal(started.currentStartedAt, started.lastProgressAt);
  assert.equal(job.report(0), undefined);

  release();
  await job.completion();
  const completed = job.state();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedReports, 2);
  assert.equal(completed.current, null);
  assert.equal(completed.currentStartedAt, undefined);
  assert.ok(!Number.isNaN(Date.parse(completed.lastProgressAt)));
  assert.equal(completed.result.source, 'verified');
  assert.ok(Number.isFinite(completed.durationMs) && completed.durationMs >= 0);

  for (const index of [0, 1]) {
    const report = job.report(index);
    assert.ok(!Number.isNaN(Date.parse(report.startedAt)));
    assert.ok(!Number.isNaN(Date.parse(report.completedAt)));
    assert.ok(Number.isFinite(report.durationMs) && report.durationMs >= 0);
  }
  assert.equal(job.report(2), undefined);
});

test('collects one completed report per protocol call without a matrix timeout', async () => {
  const reports = [{ id: 'first' }, { id: 'second' }];
  const states = [
    { status: 'running', completedReports: 0, totalReports: 2, current: 'first' },
    { status: 'running', completedReports: 1, totalReports: 2, current: 'second' },
    { status: 'completed', completedReports: 2, totalReports: 2, current: null, result: { source: 'verified' } },
  ];
  const calls = [];
  const client = {
    async start() { calls.push('start'); return states[0]; },
    async state() { calls.push('state'); return states.shift() ?? states.at(-1); },
    async report(index) { calls.push(`report:${index}`); return reports[index]; },
  };

  const collected = await collectBrowserJob(client, undefined, { pause: async () => {} });
  assert.deepEqual(collected.reports, reports);
  assert.equal(collected.state.status, 'completed');
  assert.deepEqual(calls.filter(call => call.startsWith('report:')), ['report:0', 'report:1']);
  assert.equal(calls.includes('runAll'), false);
});

test('returns completed reports and state when the browser job fails', async () => {
  const client = {
    async start() { return { status: 'running', completedReports: 0, totalReports: 2, current: 'first' }; },
    async state() {
      return { status: 'failed', completedReports: 1, totalReports: 2, current: 'second', error: 'render failed' };
    },
    async report(index) { return { id: index }; },
  };

  await assert.rejects(
    collectBrowserJob(client, undefined, { pause: async () => {} }),
    error => error.message === 'render failed'
      && error.state.status === 'failed'
      && error.reports.length === 1,
  );
});

test('fails after the 900000 millisecond run limit while activity continues', async () => {
  let currentClock = 0;
  let activity = 0;
  const running = {
    status: 'running', completedReports: 1, totalReports: 2, current: 'second',
  };
  const states = [
    running, running, running,
  ];
  const client = {
    async start() { return states.shift(); },
    async state() { return states.shift() ?? running; },
    async report(index) { return { id: index }; },
  };

  await assert.rejects(
    collectBrowserJob(client, undefined, {
      clock: () => currentClock,
      pause: async () => { currentClock += 450_001; activity += 1; },
      activity: () => activity,
      runLimitMs: 900_000,
    }),
    error => /exceeded 900000 ms/.test(error.message)
      && error.state === running
      && error.reports.length === 1
      && error.reports[0].id === 0,
  );
});

test('fails after five minutes without progress and retains collected evidence', async () => {
  let currentClock = 0;
  const running = {
    status: 'running', completedReports: 1, totalReports: 2, current: 'second',
  };
  const client = {
    async start() { return running; },
    async state() { return running; },
    async report(index) { return { id: index }; },
  };

  await assert.rejects(
    collectBrowserJob(client, undefined, {
      clock: () => currentClock,
      pause: async () => { currentClock += 300_001; },
    }),
    error => /no observable progress for 300000 ms/.test(error.message)
      && error.state === running
      && error.reports.length === 1
      && error.reports[0].id === 0,
  );
});
