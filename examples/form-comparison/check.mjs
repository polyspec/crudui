import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, describe } from 'node:test';
import { parse } from 'parse5';
import puppeteer from 'puppeteer';

import { browserJobReportCount, browserUnitLimitsMs, verifyServerReport } from './browser-report-policy.mjs';
import { checkInteraction } from './check-interaction.mjs';
import { collectBrowserJob } from './src/browser-job.mjs';
import { formatDuration } from './src/step-runner.mjs';
import { readFrameDocument } from './src/frame-document.mjs';
import { parseFrameDocument } from './src/frame-readiness.mjs';
import { subscribeMainPageReadiness } from './src/main-page-readiness.mjs';
import { formFrameworks, formRenderingPaths, formServers } from './src/runtime-paths.mjs';
import { runOperation, unitTest } from './src/unit-pool.mjs';

// The browser check of one server, run by `node --test check.mjs` with the environment FORM_COMPARISON_SERVER (one of the
// form servers), FORM_COMPARISON_ORIGIN (the HTTP origin of the stack) and FORM_COMPARISON_RESULTS (an absolute directory).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.FORM_COMPARISON_RESULTS
  ?? path.join(root, '.form-comparison/results');
if (!path.isAbsolute(output)) {
  throw new Error('FORM_COMPARISON_RESULTS must be an absolute path');
}
const selectedServer = process.env.FORM_COMPARISON_SERVER;
if (!formServers.includes(selectedServer)) {
  throw new Error(
    `Usage: FORM_COMPARISON_SERVER=<${formServers.join('|')}> FORM_COMPARISON_ORIGIN=<http-origin> node --test check.mjs`,
  );
}
const base = new URL(process.env.FORM_COMPARISON_ORIGIN ?? '');
if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/'
    || base.search || base.hash || base.username || base.password) {
  throw new Error('Expected an HTTP origin');
}
const reportFile = `report-${selectedServer}.json`;
const formsFile = `forms-${selectedServer}.png`;
const comparisonFile = `comparison-${selectedServer}.png`;
await mkdir(output, { recursive: true });
if (existsSync(path.join(output, reportFile))) {
  const previous = JSON.parse(await readFile(path.join(output, reportFile), 'utf8'));
  const stamp = previous.generatedAt.replaceAll(':', '-');
  for (const file of [reportFile, formsFile, comparisonFile]) {
    const source = path.join(output, file);
    if (existsSync(source)) {
      await rename(source, path.join(output,
        `${path.parse(file).name}-${stamp}${path.extname(file)}`));
    }
  }
}

/**
 * Print a unit progress line (`[server] unit: started|running|passed|failed ...`) for the scenario job, whose reports
 * and phases the check prints as they end. The step that runs this check has no total limit.
 */
function progress(unit, message) {
  process.stdout.write(`[${selectedServer}] ${unit}: ${message}\n`);
}

/** The outcome of each unit and operation of this check, for the report. */
const units = [];
/** The first error of a part of the check that is not a unit; the units after it are skipped. */
let failure;
const skipAfterFailure = () => failure !== undefined || units.some(unit => unit.status !== 'passed')
  ? 'an earlier part of this browser check failed' : undefined;
/** Each phase is a unit with its own limit (browser-report-policy.mjs): it fails at its limit, and its outcome is kept. */
const phase = (id, run) => unitTest(units, { id, timeoutMs: browserUnitLimitsMs[id], run, skipWhen: skipAfterFailure });

let browserVersion;
// Starting Chromium is a long operation: it runs to its end without a limit and prints its progress like a unit.
const launch = await runOperation({ id: 'browser-start', run: async () => {
  const launched = await puppeteer.launch({ headless: true, protocolTimeout: 60_000 });
  browserVersion = await launched.version();
  return launched;
} }, { label: selectedServer });
units.push({ id: 'browser-start', status: launch.status, durationMs: launch.durationMs });
if (launch.status !== 'passed') throw new Error(`${selectedServer} browser-start failed: ${launch.error}`);
const browser = launch.value;
// A stopped check closes the browser instead of leaving Chromium behind for SIGKILL.
for (const name of ['SIGTERM', 'SIGINT']) {
  process.once(name, () => {
    progress('browser-close', `${name}: closing the browser`);
    browser.close().catch(error => progress('browser-close', `${name}: closing the browser failed: ${error}`)).finally(() => process.exit(name === 'SIGINT' ? 130 : 143));
  });
}
let page;
let mainReadiness;
let completedReports = [];
let scenarioJob = {
  status: 'idle', completedReports: 0, totalReports: browserJobReportCount(), current: null,
};
let finalReport;
let report;
const startedAt = new Date().toISOString();
const startedClock = performance.now();
const activity = {
  requests: 0, responses: 0, lastRequestAt: null, lastResponseAt: null,
};
const errors = [];
const jobListeners = new Set();
const initialMounts = new Map();
const frameDocuments = new Map();
const documentChecks = [];

describe(`${selectedServer} browser check`, { concurrency: false }, () => {
  before(async () => {
    try {
      page = await browser.newPage();
      await page.exposeFunction('cruduiBrowserJobEvent', async event => {
        for (const listener of jobListeners) await listener(event);
      });
      mainReadiness = await subscribeMainPageReadiness(page);
      await page.setViewport({ width: 1680, height: 1100 });
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        activity.responses++;
        activity.lastResponseAt = new Date().toISOString();
        if (response.request().resourceType() !== 'document') return;
        const frame = parseFrameDocument(new URL(response.url()));
        if (!frame) return;
        const { server, path: renderingPath, framework, initialization } = frame;
        const key = `${server}/${renderingPath}/${framework}/${initialization}`;
        if (frameDocuments.has(key)) return;
        const result = {
          server, path: renderingPath, framework, initialization, passed: false,
        };
        frameDocuments.set(key, result);
        documentChecks.push((async () => {
          try {
            const html = await response.text();
            if (response.status() !== 200) throw new Error(`Frame document status ${response.status()}`);
            // The built page of an SSR document, with the server's insertions removed.
            result.frameSha256 = createHash('sha256')
              .update(readFrameDocument(parse, html, initialization).frame).digest('hex');
            result.passed = true;
          } catch (error) {
            result.error = error.message;
          }
        })());
      });
      await page.setRequestInterception(true);
      page.on('request', async request => {
        activity.requests++;
        activity.lastRequestAt = new Date().toISOString();
        const match = new RegExp(
          `/api/(${formServers.join('|')})/load/(${formRenderingPaths.join('|')})/(${formFrameworks.join('|')})$`,
        ).exec(request.url());
        const key = match?.slice(1).join('/');
        // The SSR column loads the record before the server renders; only the CSR column mounts first.
        const csrColumn = match
          && new URL(request.frame().url()).searchParams.get('initialization') === 'csr';
        if (csrColumn && !initialMounts.has(key)) {
          const result = {
            server: match[1], path: match[2], framework: match[3], passed: false,
          };
          initialMounts.set(key, result);
          try {
            result.passed = await request.frame().evaluate(() =>
              Array.from(document.querySelectorAll('#view input[name]')).some(input =>
                /^form\[companies\]\[[^\]]+\]\[stores\]\[[^\]]+\]\[name\]$/.test(input.name)));
            if (!result.passed) {
              result.error = 'Nested form was not mounted before the server load request';
            }
          } catch (error) {
            result.error = error.message;
          }
        }
        await request.continue();
      });
    } catch (error) {
      failure = error;
      throw error;
    }
  });

  phase('main-page', async () => {
    await page.goto(`${base.origin}/benchmark-console/?server=${selectedServer}`, { waitUntil: 'load' });
    const mainReady = await mainReadiness.wait();
    if (JSON.stringify(mainReady) !== JSON.stringify({
      type: 'crudui:main-ready', server: selectedServer, framework: 'react',
    })) throw new Error('Main page readiness differs');
    await page.screenshot({ path: path.join(output, formsFile), fullPage: true });
  });

  test('scenario job', async t => {
    const reason = skipAfterFailure();
    if (reason !== undefined) return t.skip(reason);
    try {
      let loggedProgress = '';
      let loggedReports = 0;
      const jobStarted = performance.now();
      const collected = await collectBrowserJob({
        start: servers => page.evaluate(value => window.comparison.startRun(value), servers),
        subscribe(listener) {
          jobListeners.add(listener);
          return () => jobListeners.delete(listener);
        },
      }, [selectedServer], {
        onState(state, reports) {
          scenarioJob = state;
          completedReports = [...reports];
          for (const report of reports.slice(loggedReports)) {
            const results = report.results ?? [];
            const failed = results.filter(item => !item.passed).length;
            const label = [report.server, report.path, report.framework,
              report.transport ?? report.kind].join('/');
            progress(label, `${failed === 0 ? 'passed in' : `failed ${failed} of ${results.length} checks in`}`
              + ` ${formatDuration(report.durationMs ?? 0)}`
              + ` (${reports.indexOf(report) + 1}/${state.totalReports},`
              + ` ${formatDuration(performance.now() - jobStarted)} elapsed)`);
          }
          loggedReports = reports.length;
          const current = state.current ?? '';
          if (current !== loggedProgress) {
            if (current) {
              progress(current, `started (report ${state.completedReports + 1} of ${state.totalReports})`);
            }
            loggedProgress = current;
          }
        },
        onProgress({ label, elapsedMs, limitMs, completedReports: done, totalReports }) {
          progress(label ?? 'page-work', `running ${formatDuration(elapsedMs)} of ${formatDuration(limitMs)}`
            + ` (${done}/${totalReports} reports)`);
        },
      });
      scenarioJob = collected.state;
      completedReports = collected.reports;
      report = {
        scope: 'verification', startedAt, origin: base.origin,
        source: scenarioJob.result?.source, activity, scenarioJob,
        reports: completedReports.filter(item => item.kind === 'scenario'),
        initializations: completedReports.filter(item => item.kind === 'initialization'),
      };
      finalReport = report;
    } catch (error) {
      if (error?.state) scenarioJob = error.state;
      if (error?.reports) completedReports = error.reports;
      failure = error;
      throw error;
    }
  });

  phase('interactions', async () => {
    report.interactions = await checkInteraction(page, [selectedServer]);
    report.initialMounts = [...initialMounts.values()];
  });

  phase('frame-documents', async () => {
    await Promise.all(documentChecks);
    report.frameDocuments = [...frameDocuments.values()];
    report.browser = browserVersion;
    report.pageErrors = errors;
    report.initializationArtifacts =
      `initialization-${startedAt.replaceAll(':', '-')}`;
  });

  phase('artifacts', async () => {
    for (const result of report.initializations) {
      const directory = path.join(
        output, report.initializationArtifacts, result.server, result.path, result.framework,
      );
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'comparisons.json'), JSON.stringify({
        results: result.results, cssFailures: result.cssFailures,
      }, null, 2) + '\n');
      await Promise.all(result.stages.map(async ({ html, ...state }) => {
        const name = `${state.column}-${state.stage}`;
        await writeFile(path.join(directory, `${name}.html`), html);
        await writeFile(path.join(directory, `${name}.json`),
          JSON.stringify(state, null, 2) + '\n');
      }));
    }
    await page.screenshot({ path: path.join(output, comparisonFile), fullPage: true });
  });

  test('verification report', async t => {
    const reason = skipAfterFailure();
    if (reason !== undefined) return t.skip(reason);
    try {
      report.units = units;
      report.completedAt = new Date().toISOString();
      report.generatedAt = report.completedAt;
      report.durationMs = Math.max(0, performance.now() - startedClock);
      for (const result of report.initializations) {
        process.stdout.write(
          `${result.server}/${result.path}/${result.framework}/initialization: ${result.results.filter(item => item.passed).length}/${result.results.length}\n`,
        );
        for (const check of result.results.filter(item => !item.passed)) {
          process.stdout.write(`  FAIL ${check.label}/${check.category}: ${check.error}\n`);
        }
      }
      for (const result of report.reports) {
        process.stdout.write(
          `${result.server}/${result.path}/${result.framework}/${result.transport}: ${result.results.filter(item => item.passed).length}/${result.results.length}\n`,
        );
        for (const check of result.results.filter(item => !item.passed)) {
          process.stdout.write(`  FAIL ${check.id}: ${check.error}\n`);
        }
      }
      if (errors.length) process.stdout.write(`Browser errors: ${JSON.stringify(errors)}\n`);
      for (const result of report.initialMounts) {
        process.stdout.write(
          `${result.server}/${result.path}/${result.framework}/mount-before-load: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`,
        );
      }
      for (const result of report.frameDocuments) {
        process.stdout.write(
          `${result.server}/${result.path}/${result.framework}/${result.initialization}-document: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`,
        );
      }
      const verification = verifyServerReport(report, selectedServer);
      Object.assign(report, {
        complete: verification.complete, passed: verification.passed,
        failedChecks: verification.failedChecks,
      });
      await writeFile(path.join(output, reportFile), JSON.stringify(report) + '\n');
      const checked = ['scenarios', 'initializations', 'interactions', 'mounts', 'documents']
        .reduce((sum, section) => sum + Object.values(verification[section])
          .reduce((count, item) => count + item.total, 0), 0);
      process.stdout.write(
        `${selectedServer}: verification completed (${checked} checks; ${verification.failedChecks} failed; ${formatDuration(report.durationMs)})\n`,
      );
      if (!verification.passed) process.exitCode = 1;
    } catch (error) {
      failure = error;
      throw error;
    }
  });
});

after(async () => {
  try {
    const failedUnit = units.find(unit => unit.status !== 'passed');
    const error = failure ?? (failedUnit && new Error(failedUnit.error ?? `${failedUnit.id} ${failedUnit.status}`));
    if (error !== undefined) {
      scenarioJob = await page?.evaluate(() =>
        window.comparison?.runState() ?? null).catch(() => scenarioJob) ?? scenarioJob;
      const current = await page?.evaluate(() =>
        window.comparison?.getReports() ?? []).catch(() => []) ?? [];
      const key = report =>
        [report.server, report.path, report.framework, report.transport ?? report.kind].join('/');
      const reports = [...new Map([...completedReports, ...current]
        .map(item => [key(item), item])).values()];
      const failedAt = new Date().toISOString();
      const incomplete = {
        ...finalReport, generatedAt: failedAt, startedAt, completedAt: failedAt,
        durationMs: Math.max(0, performance.now() - startedClock),
        origin: base.origin, activity, scenarioJob, units,
        reports: reports.filter(item => item.kind === 'scenario'),
        initializations: reports.filter(item => item.kind === 'initialization'),
        error: error?.stack ?? String(error),
      };
      await writeFile(
        path.join(output, `incomplete-${Date.now()}-${selectedServer}.json`),
        JSON.stringify(incomplete) + '\n',
      );
    }
  } finally {
    const closed = await runOperation({ id: 'browser-close', run: () => browser.close() }, { label: selectedServer });
    units.push({ id: 'browser-close', status: closed.status, durationMs: closed.durationMs });
    if (closed.status !== 'passed') process.exitCode = 1;
  }
});
