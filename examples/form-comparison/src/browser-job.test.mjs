import assert from 'node:assert/strict';
import test from 'node:test';
import {
  browserReportLimitMs, browserReportLimitsMs, collectBrowserJob, createBrowserJob,
} from './browser-job.mjs';

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

test('gives each report the limit of its kind and none to the whole run', () => {
  assert.equal(browserReportLimitMs('php/bindForm/react/initialization'),
    browserReportLimitsMs.initialization);
  assert.equal(browserReportLimitMs('php/bindForm/react/form'), browserReportLimitsMs.scenario);
  assert.equal(browserReportLimitMs(null), browserReportLimitsMs.transition);
  for (const limit of Object.values(browserReportLimitsMs)) {
    assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= 180_000);
  }
});

test('fails one report that exceeds its own limit and retains collected evidence', async () => {
  const timers = controlledTimers();
  let ready;
  const initialized = new Promise(resolve => { ready = resolve; });
  const running = {
    status: 'running', completedReports: 0, totalReports: 2, current: 'php/bindForm/react/form',
  };
  const protocol = eventClient(running);
  const collected = collectBrowserJob(protocol.client, undefined, {
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, onState: async () => ready(),
  });
  await initialized;
  // The next report is an initialization report, so its own longer limit applies.
  await protocol.emit({ type: 'report', index: 0, report: { id: 0 }, state: {
    status: 'running', completedReports: 1, totalReports: 2,
    current: 'php/bindForm/react/initialization',
  } });
  assert.throws(() => timers.fire(browserReportLimitsMs.scenario), /Expected timer/);
  timers.fire(browserReportLimitsMs.initialization);
  await assert.rejects(
    collected,
    error => /report php\/bindForm\/react\/initialization exceeded its 180000 ms limit/
      .test(error.message)
      && error.state.current === 'php/bindForm/react/initialization'
      && error.reports.length === 1
      && error.reports[0].id === 0,
  );
});

test('reports the elapsed time of the running report while it runs', async () => {
  const timers = controlledTimers();
  let ready;
  const initialized = new Promise(resolve => { ready = resolve; });
  const progress = [];
  let now = 0;
  const protocol = eventClient({
    status: 'running', completedReports: 0, totalReports: 2, current: 'php/bindForm/react/form',
  });
  const collected = collectBrowserJob(protocol.client, undefined, {
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, heartbeatMs: 15_000,
    clock: () => now, onProgress: value => progress.push(value), onState: async () => ready(),
  });
  await initialized;
  now = 15_000;
  timers.fire(15_000);
  assert.deepEqual(progress, [{
    label: 'php/bindForm/react/form', limitMs: browserReportLimitsMs.scenario,
    elapsedMs: 15_000, completedReports: 0, totalReports: 2,
  }]);
  protocol.emit({ type: 'state', state: {
    status: 'failed', completedReports: 0, totalReports: 2, current: null, error: 'stopped',
  } });
  await assert.rejects(collected, /stopped/);
});
