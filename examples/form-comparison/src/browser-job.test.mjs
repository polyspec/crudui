import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBrowserJob, createBrowserJob } from './browser-job.mjs';

test('starts the matrix without waiting for all reports', async () => {
  const events = [];
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
  }, { totalReports: 2, publish: event => events.push(event) });

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
  assert.deepEqual(events.map(event => event.type), [
    'state', 'report', 'state', 'report', 'state',
  ]);
  assert.deepEqual(events.filter(event => event.type === 'report')
    .map(event => event.index), [0, 1]);
  assert.equal(events.at(-1).state.status, 'completed');
});

function eventClient(initial) {
  let listener;
  let activityListener;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  return {
    client: {
      async subscribe(next) {
        listener = next;
        return () => { listener = undefined; };
      },
      subscribeActivity(next) {
        activityListener = next;
        return () => { activityListener = undefined; };
      },
      async start() {
        started();
        return initial;
      },
      async state() { throw new Error('state polling is not allowed'); },
      async report() { throw new Error('report polling is not allowed'); },
    },
    started: startedPromise,
    emit: event => listener(event),
    activity: value => activityListener(value),
  };
}

function controlledTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, milliseconds) {
      const id = nextId++;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    fire(milliseconds) {
      const found = [...timers].find(([, timer]) => timer.milliseconds === milliseconds);
      assert.ok(found, 'Expected timer ' + milliseconds);
      timers.delete(found[0]);
      found[1].callback();
    },
  };
}

test('collects one completed report per event without state polling', async () => {
  const reports = [{ id: 'first' }, { id: 'second' }];
  const initial = {
    status: 'running', completedReports: 0, totalReports: 2, current: 'first',
  };
  const protocol = eventClient(initial);
  const collectedPromise = collectBrowserJob(protocol.client);
  await protocol.started;
  await protocol.emit({ type: 'report', index: 0, report: reports[0], state: {
    status: 'running', completedReports: 1, totalReports: 2, current: 'second',
  } });
  await protocol.emit({ type: 'report', index: 1, report: reports[1], state: {
    status: 'running', completedReports: 2, totalReports: 2, current: null,
  } });
  await protocol.emit({ type: 'state', state: {
    status: 'completed', completedReports: 2, totalReports: 2, current: null,
    result: { source: 'verified' },
  } });
  const collected = await collectedPromise;
  assert.deepEqual(collected.reports, reports);
  assert.equal(collected.state.status, 'completed');
});

test('returns completed reports and state when the browser job fails', async () => {
  const protocol = eventClient({
    status: 'running', completedReports: 0, totalReports: 2, current: 'first',
  });
  const collected = collectBrowserJob(protocol.client);
  await protocol.started;
  await protocol.emit({ type: 'report', index: 0, report: { id: 0 }, state: {
    status: 'running', completedReports: 1, totalReports: 2, current: 'second',
  } });
  await protocol.emit({ type: 'state', state: {
    status: 'failed', completedReports: 1, totalReports: 2,
    current: 'second', error: 'render failed',
  } });
  await assert.rejects(
    collected,
    error => error.message === 'render failed'
      && error.state.status === 'failed'
      && error.reports.length === 1,
  );
});

test('fails after the 900000 millisecond run limit while activity continues', async () => {
  const timers = controlledTimers();
  const running = {
    status: 'running', completedReports: 0, totalReports: 2, current: 'first',
  };
  const protocol = eventClient(running);
  const collected = collectBrowserJob(protocol.client, undefined, {
    setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    runLimitMs: 900_000, stallLimitMs: 300_000,
  });
  await protocol.started;
  protocol.activity({ requests: 1 });
  timers.fire(900_000);
  await assert.rejects(
    collected,
    error => /exceeded 900000 ms/.test(error.message)
      && error.state === running
      && error.reports.length === 0,
  );
});

test('fails after five minutes without progress and retains collected evidence', async () => {
  const timers = controlledTimers();
  const running = {
    status: 'running', completedReports: 0, totalReports: 2, current: 'first',
  };
  const protocol = eventClient(running);
  const collected = collectBrowserJob(protocol.client, undefined, {
    setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    runLimitMs: 900_000, stallLimitMs: 300_000,
  });
  await protocol.started;
  await protocol.emit({ type: 'report', index: 0, report: { id: 0 }, state: {
    status: 'running', completedReports: 1, totalReports: 2, current: 'second',
  } });
  timers.fire(300_000);
  await assert.rejects(
    collected,
    error => /no observable progress for 300000 ms/.test(error.message)
      && error.state.current === 'second'
      && error.reports.length === 1
      && error.reports[0].id === 0,
  );
});
