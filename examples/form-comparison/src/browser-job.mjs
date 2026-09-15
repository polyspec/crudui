function timestamp(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Browser job clock returned an invalid date');
  return date.toISOString();
}

function message(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

/**
 * Every browser unit holds its own limit, sized from its measured duration: one initialization
 * report compares 18 stages in two columns and took 27 to 30 seconds per report, one scenario
 * report 1 to 2 seconds, and the page needs a few seconds between reports to load the next pair
 * of frames. A unit that reaches its limit fails the run with the unit and its elapsed time; no
 * single limit covers a whole run.
 */
export const browserReportLimitsMs = Object.freeze({
  initialization: 180_000, scenario: 60_000, transition: 120_000,
});

/** The limit of the report a label names, or the limit between reports when it names none. */
export function browserReportLimitMs(label) {
  if (typeof label !== 'string' || label.length === 0) return browserReportLimitsMs.transition;
  return label.endsWith('/initialization')
    ? browserReportLimitsMs.initialization : browserReportLimitsMs.scenario;
}

function attachProgress(error, state, reports) {
  const failure = error instanceof Error ? error : new Error(String(error));
  if (failure.state === undefined) failure.state = state;
  if (failure.reports === undefined) failure.reports = [...reports];
  return failure;
}

/** Run a browser matrix asynchronously and retain each completed report separately. */
export function createBrowserJob(run, options = {}) {
  const totalReports = options.totalReports;
  if (!Number.isSafeInteger(totalReports) || totalReports < 1) throw new Error('Browser job requires a positive report count');
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => performance.now());
  const publish = options.publish ?? (() => {});
  if (typeof publish !== 'function') throw new Error('Browser job publisher must be a function');
  let status = 'idle';
  let startedAt;
  let completedAt;
  let startedClock;
  let durationMs;
  let current = null;
  let currentStartedAt;
  let lastProgressAt;
  let result;
  let error;
  let promise;
  const reports = [];

  function state() {
    return {
      status, totalReports, completedReports: reports.length, current,
      ...(startedAt ? { startedAt } : {}),
      ...(currentStartedAt ? { currentStartedAt } : {}),
      ...(lastProgressAt ? { lastProgressAt } : {}),
      ...(completedAt ? { completedAt, durationMs } : {}),
      ...(result === undefined ? {} : { result }),
      ...(error === undefined ? {} : { error }),
    };
  }

  async function publishState() {
    await publish({ type: 'state', state: state() });
  }

  async function report(label, action) {
    if (typeof label !== 'string' || label.length === 0 || typeof action !== 'function') {
      throw new Error('Browser report requires a label and operation');
    }
    if (reports.length >= totalReports) throw new Error('Browser job produced too many reports');
    current = label;
    const reportStartedAt = timestamp(now);
    currentStartedAt = reportStartedAt;
    lastProgressAt = reportStartedAt;
    const reportStartedClock = clock();
    await publishState();
    const value = await action();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' did not return a report object');
    const reportCompletedAt = timestamp(now);
    const reportDurationMs = Math.max(0, clock() - reportStartedClock);
    const timed = { ...value, startedAt: reportStartedAt, completedAt: reportCompletedAt, durationMs: reportDurationMs };
    reports.push(timed);
    current = null;
    currentStartedAt = undefined;
    lastProgressAt = reportCompletedAt;
    await publish({
      type: 'report', index: reports.length - 1, report: timed, state: state(),
    });
    return timed;
  }

  function start() {
    if (status !== 'idle') throw new Error('Browser job has already started');
    status = 'running';
    startedAt = timestamp(now);
    lastProgressAt = startedAt;
    startedClock = clock();
    promise = (async () => {
      try {
        result = await run({ report });
        if (reports.length !== totalReports) throw new Error('Browser job completed ' + reports.length + '/' + totalReports + ' reports');
        status = 'completed';
        return result;
      } catch (cause) {
        status = 'failed';
        error = message(cause);
        throw cause;
      } finally {
        completedAt = timestamp(now);
        durationMs = Math.max(0, clock() - startedClock);
        await publishState();
      }
    })();
    promise.catch(() => {});
    return state();
  }

  return {
    start,
    state,
    report: index => reports[index],
    completion: () => {
      if (!promise) throw new Error('Browser job has not started');
      return promise;
    },
  };
}

function validState(state, reports) {
  if (!state || !['running', 'completed', 'failed'].includes(state.status)) {
    throw new Error('Browser job returned an invalid state');
  }
  if (!Number.isSafeInteger(state.completedReports)
      || !Number.isSafeInteger(state.totalReports)
      || state.completedReports !== reports.length
      || state.completedReports > state.totalReports) {
    throw new Error('Browser job returned invalid report progress');
  }
}

/** Collect browser job reports from subscribed progress and activity events. */
export async function collectBrowserJob(client, input, options = {}) {
  const onState = options.onState ?? (() => {});
  const onProgress = options.onProgress ?? (() => {});
  const limitFor = options.limitForReport ?? browserReportLimitMs;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const clock = options.clock ?? (() => performance.now());
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error('Browser job heartbeat must be a positive duration');
  }
  const reports = [];
  let state;
  let started = false;
  let buffering = true;
  let finished = false;
  let unitLabel;
  let unitTimer;
  let heartbeatTimer;
  let unsubscribe = () => {};
  const pending = [];
  let queue = Promise.resolve();
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  function fail(error) {
    if (finished) return;
    finished = true;
    rejectCompletion(attachProgress(error, state, reports));
  }

  function stopUnitTimers() {
    if (unitTimer !== undefined) clearTimer(unitTimer);
    if (heartbeatTimer !== undefined) clearTimer(heartbeatTimer);
    unitTimer = undefined;
    heartbeatTimer = undefined;
  }

  /** Time one unit: the report the job is running, or the page work between two reports. */
  function startUnit(label) {
    stopUnitTimers();
    unitLabel = label;
    if (!started || finished) return;
    const limitMs = limitFor(label);
    const startedClock = clock();
    unitTimer = setTimer(() => fail(new Error(
      `Browser ${label === null ? 'page work between reports' : `report ${label}`} exceeded its `
      + `${limitMs} ms limit after ${Math.round(clock() - startedClock)} ms`,
    )), limitMs);
    const beat = () => {
      onProgress({
        label, limitMs, elapsedMs: clock() - startedClock,
        completedReports: reports.length, totalReports: state?.totalReports,
      });
      heartbeatTimer = setTimer(beat, heartbeatMs);
    };
    heartbeatTimer = setTimer(beat, heartbeatMs);
  }

  async function acceptState(next) {
    validState(next, reports);
    state = next;
    const label = next.current ?? null;
    if (label !== unitLabel) startUnit(label);
    await onState(state, [...reports]);
    if (state.status === 'completed') {
      if (reports.length !== state.totalReports) {
        throw new Error(
          `Browser job returned ${reports.length}/${state.totalReports} reports`,
        );
      }
      if (!finished) {
        finished = true;
        resolveCompletion({ state, reports });
      }
    } else if (state.status === 'failed') {
      throw new Error(state.error || 'Browser job failed');
    }
  }

  async function acceptEvent(event) {
    if (!event || !['state', 'report'].includes(event.type)) {
      throw new Error('Browser job returned an invalid event');
    }
    if (event.type === 'report') {
      if (event.index !== reports.length || !event.report
          || typeof event.report !== 'object' || Array.isArray(event.report)) {
        throw new Error('Browser job returned an invalid report event');
      }
      reports.push(event.report);
    }
    await acceptState(event.state);
  }

  function receive(event) {
    if (buffering) {
      pending.push(event);
      return Promise.resolve();
    }
    queue = queue.then(() => acceptEvent(event)).catch(fail);
    return queue;
  }

  try {
    if (typeof client.subscribe !== 'function') {
      throw new Error('Browser job client requires an event subscription');
    }
    unsubscribe = await client.subscribe(receive) ?? unsubscribe;
    state = await client.start(input);
    validState(state, reports);
    started = true;
    startUnit(state.current ?? null);
    await onState(state, [...reports]);
    while (pending.length > 0) await acceptEvent(pending.shift());
    buffering = false;
    return await completion;
  } catch (error) {
    fail(error);
    return await completion;
  } finally {
    stopUnitTimers();
    await unsubscribe();
  }
}
