function timestamp(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Browser job clock returned an invalid date');
  return date.toISOString();
}

function message(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export const browserJobStallLimitMs = 5 * 60 * 1000;
export const browserJobRunLimitMs = 900 * 1000;

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
  const stallLimitMs = options.stallLimitMs ?? browserJobStallLimitMs;
  const runLimitMs = options.runLimitMs ?? browserJobRunLimitMs;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  if (!Number.isFinite(stallLimitMs) || stallLimitMs <= 0) {
    throw new Error('Browser job stall limit must be a positive duration');
  }
  if (!Number.isFinite(runLimitMs) || runLimitMs <= 0) {
    throw new Error('Browser job run limit must be a positive duration');
  }
  const reports = [];
  let state;
  let started = false;
  let buffering = true;
  let finished = false;
  let runTimer;
  let stallTimer;
  let unsubscribe = () => {};
  let unsubscribeActivity = () => {};
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

  function resetStallTimer() {
    if (!started || finished) return;
    if (stallTimer !== undefined) clearTimer(stallTimer);
    stallTimer = setTimer(() => fail(new Error(
      `Browser job made no observable progress for ${stallLimitMs} ms`,
    )), stallLimitMs);
  }

  async function acceptState(next) {
    validState(next, reports);
    state = next;
    resetStallTimer();
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
    if (typeof client.subscribeActivity === 'function') {
      unsubscribeActivity = await client.subscribeActivity(() => resetStallTimer())
        ?? unsubscribeActivity;
    }
    state = await client.start(input);
    validState(state, reports);
    started = true;
    runTimer = setTimer(() => fail(new Error(
      `Browser job exceeded ${runLimitMs} ms`,
    )), runLimitMs);
    resetStallTimer();
    await onState(state, [...reports]);
    while (pending.length > 0) await acceptEvent(pending.shift());
    buffering = false;
    return await completion;
  } catch (error) {
    fail(error);
    return await completion;
  } finally {
    if (runTimer !== undefined) clearTimer(runTimer);
    if (stallTimer !== undefined) clearTimer(stallTimer);
    await unsubscribe();
    await unsubscribeActivity();
  }
}
