import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { verifyServerReport } from './browser-report-policy.mjs';
import { checkInteraction } from './check-interaction.mjs';
import { collectBrowserJob } from './src/browser-job.mjs';
import { formFrameworks, formRenderingPaths, formServers } from './src/runtime-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.FORM_COMPARISON_RESULTS
  ?? path.join(root, '.form-comparison/results');
if (!path.isAbsolute(output)) {
  throw new Error('FORM_COMPARISON_RESULTS must be an absolute path');
}
const selectedServer = process.argv[2];
if (!formServers.includes(selectedServer) || !process.argv[3] || process.argv[4]) {
  throw new Error(
    'Usage: node check.mjs <php|php-ext|go|rust> <http-origin>',
  );
}
const base = new URL(process.argv[3]);
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

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 60_000 });
let page;
let completedReports = [];
let scenarioJob = {
  status: 'idle', completedReports: 0, totalReports: 12, current: null,
};
let finalReport;
const startedAt = new Date().toISOString();
const startedClock = performance.now();
const activity = {
  requests: 0, responses: 0, lastRequestAt: null, lastResponseAt: null,
};
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const initialMounts = new Map();
  const staticDocuments = new Map();
  const documentChecks = [];
  page.on('response', response => {
    activity.responses++;
    activity.lastResponseAt = new Date().toISOString();
    if (response.request().resourceType() !== 'document') return;
    const url = new URL(response.url());
    const match = new RegExp(
      `^/frames/(${formRenderingPaths.join('|')})-(${formFrameworks.join('|')})/$`,
    ).exec(url.pathname);
    if (!match) return;
    const server = url.searchParams.get('server') ?? 'php';
    const key = `${server}/${match[1]}/${match[2]}`;
    if (staticDocuments.has(key)) return;
    const result = {
      server, path: match[1], framework: match[2], passed: false,
    };
    staticDocuments.set(key, result);
    documentChecks.push((async () => {
      try {
        const html = await response.text();
        result.sha256 = createHash('sha256').update(html).digest('hex');
        result.passed = response.status() === 200 && await page.evaluate(source => {
          const document = new DOMParser().parseFromString(source, 'text/html');
          const view = document.querySelector('#view');
          return view !== null && view.childNodes.length === 0
            && document.querySelector('script[type=module]') !== null;
        }, html);
        if (!result.passed) {
          result.error =
            'The HTML response must contain an empty form container and the browser module';
        }
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
    if (key && !initialMounts.has(key)) {
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
  await page.goto(`${base.origin}/?server=${selectedServer}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.comparison, { timeout: 30_000 });
  await page.screenshot({ path: path.join(output, formsFile), fullPage: true });
  let loggedProgress = '';
  const collected = await collectBrowserJob({
    start: servers => page.evaluate(value => window.comparison.startRun(value), servers),
    state: () => page.evaluate(() => window.comparison.runState()),
    report: index => page.evaluate(value => window.comparison.runReport(value), index),
  }, [selectedServer], {
    activity: () => activity,
    onState(state, reports) {
      scenarioJob = state;
      completedReports = [...reports];
      const progress =
        `${state.completedReports}/${state.totalReports} ${state.current ?? state.status}`;
      if (progress !== loggedProgress) {
        process.stdout.write(`${selectedServer}: ${progress}\n`);
        loggedProgress = progress;
      }
    },
  });
  scenarioJob = collected.state;
  completedReports = collected.reports;
  const report = {
    scope: 'verification', startedAt, origin: base.origin,
    metadata: scenarioJob.result?.metadata, activity, scenarioJob,
    reports: completedReports,
  };
  finalReport = report;
  report.interactions = await checkInteraction(page, [selectedServer]);
  report.initialMounts = [...initialMounts.values()];
  await Promise.all(documentChecks);
  report.staticDocuments = [...staticDocuments.values()];
  report.browser = await browser.version();
  report.pageErrors = errors;
  report.initializationArtifacts =
    `initialization-${startedAt.replaceAll(':', '-')}`;
  for (const result of report.reports) {
    const evidence = result.results.find(check => check.id === 'initialization')?.evidence;
    if (!evidence) continue;
    const directory = path.join(
      output, report.initializationArtifacts, result.server, result.path,
      result.framework, result.transport,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'comparisons.json'), JSON.stringify({
      comparisons: evidence.comparisons, cssFailures: evidence.cssFailures,
    }, null, 2) + '\n');
    await Promise.all(evidence.stages.map(async ({ html, ...state }) => {
      const name = `${state.route}-${state.stage}`;
      await writeFile(path.join(directory, `${name}.html`), html);
      await writeFile(path.join(directory, `${name}.json`),
        JSON.stringify(state, null, 2) + '\n');
    }));
  }
  await page.screenshot({ path: path.join(output, comparisonFile), fullPage: true });
  report.completedAt = new Date().toISOString();
  report.generatedAt = report.completedAt;
  report.durationMs = Math.max(0, performance.now() - startedClock);
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
  for (const result of report.staticDocuments) {
    process.stdout.write(
      `${result.server}/${result.path}/${result.framework}/static-html: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`,
    );
  }
  const verification = verifyServerReport(report, selectedServer);
  Object.assign(report, {
    complete: verification.complete, passed: verification.passed,
    failedChecks: verification.failedChecks, performance: verification.performance,
  });
  await writeFile(path.join(output, reportFile), JSON.stringify(report) + '\n');
  const checked = ['scenarios', 'interactions', 'mounts', 'documents']
    .reduce((sum, section) => sum + Object.values(verification[section])
      .reduce((count, item) => count + item.total, 0), 0);
  process.stdout.write(
    `${selectedServer}: verification completed (${checked} checks; ${verification.failedChecks} failed; ${report.durationMs.toFixed(0)}/${verification.performance.budgetMs} ms)\n`,
  );
  if (!verification.passed) process.exitCode = 1;
} catch (error) {
  if (error?.state) scenarioJob = error.state;
  if (error?.reports) completedReports = error.reports;
  scenarioJob = await page?.evaluate(() =>
    window.comparison?.runState() ?? null).catch(() => scenarioJob) ?? scenarioJob;
  const current = await page?.evaluate(() =>
    window.comparison?.getReports() ?? []).catch(() => []) ?? [];
  const key = report =>
    [report.server, report.path, report.framework, report.transport].join('/');
  const reports = [...new Map([...completedReports, ...current]
    .map(report => [key(report), report])).values()];
  const failedAt = new Date().toISOString();
  const incomplete = {
    ...(finalReport ?? {}), generatedAt: failedAt, startedAt, completedAt: failedAt,
    durationMs: Math.max(0, performance.now() - startedClock),
    origin: base.origin, activity, scenarioJob, reports,
    error: error?.stack ?? String(error),
  };
  await writeFile(
    path.join(output, `incomplete-${Date.now()}-${selectedServer}.json`),
    JSON.stringify(incomplete) + '\n',
  );
  throw error;
} finally {
  await browser.close();
}
