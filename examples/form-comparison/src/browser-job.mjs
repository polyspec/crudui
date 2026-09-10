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
    const value = await action();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' did not return a report object');
    const reportCompletedAt = timestamp(now);
    const reportDurationMs = Math.max(0, clock() - reportStartedClock);
    const timed = { ...value, startedAt: reportStartedAt, completedAt: reportCompletedAt, durationMs: reportDurationMs };
    reports.push(timed);
    current = null;
    currentStartedAt = undefined;
    lastProgressAt = reportCompletedAt;
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

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Read job state with short calls and transfer each completed report once. */
export async function collectBrowserJob(client, input, options = {}) {
  const pause = options.pause ?? delay;
  const intervalMs = options.intervalMs ?? 250;
  const onState = options.onState ?? (() => {});
  const activity = options.activity ?? (() => null);
  const clock = options.clock ?? (() => performance.now());
  const stallLimitMs = options.stallLimitMs ?? browserJobStallLimitMs;
  const runLimitMs = options.runLimitMs ?? browserJobRunLimitMs;
  if (!Number.isFinite(stallLimitMs) || stallLimitMs <= 0) {
    throw new Error('Browser job stall limit must be a positive duration');
  }
  if (!Number.isFinite(runLimitMs) || runLimitMs <= 0) {
    throw new Error('Browser job run limit must be a positive duration');
  }
  const reports = [];
  let state;
  try {
    state = await client.start(input);
  } catch (error) {
    throw attachProgress(error, state, reports);
  }
  let progressToken;
  const startedClock = clock();
  let progressClock = startedClock;
  while (true) {
    if (!state || !['running', 'completed', 'failed'].includes(state.status)) throw new Error('Browser job returned an invalid state');
    if (!Number.isSafeInteger(state.completedReports) || !Number.isSafeInteger(state.totalReports)
      || state.completedReports < reports.length || state.completedReports > state.totalReports) {
      throw new Error('Browser job returned invalid report progress');
    }
    while (reports.length < state.completedReports) {
      let report;
      try {
        report = await client.report(reports.length);
      } catch (error) {
        throw attachProgress(error, state, reports);
      }
      if (!report || typeof report !== 'object') throw new Error('Browser job report ' + reports.length + ' is unavailable');
      reports.push(report);
    }
    await onState(state, reports);
    const currentClock = clock();
    if (currentClock - startedClock > runLimitMs) {
      throw attachProgress(
        new Error(`Browser job exceeded ${runLimitMs} ms`),
        state, reports,
      );
    }
    if (state.status === 'completed') {
      if (reports.length !== state.totalReports) throw new Error('Browser job returned ' + reports.length + '/' + state.totalReports + ' reports');
      return { state, reports };
    }
    if (state.status === 'failed') {
      const failure = new Error(state.error || 'Browser job failed');
      failure.state = state;
      failure.reports = reports;
      throw failure;
    }
    const nextProgressToken = JSON.stringify([
      state.completedReports, state.current ?? null, state.lastProgressAt ?? null, activity(),
    ]);
    if (nextProgressToken !== progressToken) {
      progressToken = nextProgressToken;
      progressClock = currentClock;
    } else if (currentClock - progressClock > stallLimitMs) {
      throw attachProgress(
        new Error(`Browser job made no observable progress for ${stallLimitMs} ms`),
        state, reports,
      );
    }
    await pause(intervalMs);
    try {
      state = await client.state();
    } catch (error) {
      throw attachProgress(error, state, reports);
    }
  }
}
