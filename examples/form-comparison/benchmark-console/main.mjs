import { createBrowserJob } from '../browser-job.mjs';
import { loadComparisonFrames } from '../frame-readiness.mjs';
import { compareSnapshots, formSnapshot, snapshotHash, styleSnapshot } from '../form-snapshot.mjs';
import {
  formFrameworks, formInitializations, formRenderingPaths, formServers, formTransports,
  initializationCategories, initializationComparisons, initializationStages,
} from '../runtime-paths.mjs';
import { translations } from '../text.mjs';

const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const t = translations(language);
const frameworkSelector = document.querySelector('#framework');
const serverSelector = document.querySelector('#server');
const pathSelector = document.querySelector('#path');
const initialServer = new URLSearchParams(location.search).get('server') ?? 'php';
if (!formServers.includes(initialServer)) throw new Error('Unknown server');
serverSelector.value = initialServer;
const frames = formInitializations.map(initialization => document.querySelector(`#${initialization}`));
const [ssrFrame, csrFrame] = frames;
let reports = [];
let running = false;
let activeJob;

for (const id of ['title', 'intro', 'manual', 'download']) {
  document.querySelector(`#${id}`).textContent = t[id];
}
document.querySelector('#framework-label').textContent = t.framework;
document.querySelector('#server-label').textContent = t.server;
document.querySelector('#path-label').textContent = t.path;
document.querySelector('#all-checks').textContent = t.allChecks;
document.querySelector('#initialization-check').textContent = t.initializationCheck;
document.querySelector('#initialization-label').textContent = t.initialization;
document.querySelector('#source-label').textContent = t.source;
document.querySelector('#language').textContent = language === 'ko' ? 'English' : '한국어';
document.documentElement.lang = language;
for (const option of serverSelector.options) option.textContent = t.serverNames[option.value];
const metadata = await (await fetch('/source.json')).json();
document.querySelector('#source').textContent = JSON.stringify(metadata, null, 2);

/** Capture one column: HTML, DOM, control state, fields, computed CSS, ordered data, focus and response. */
async function capture(frame, response) {
  const comparison = frame.contentWindow.comparison;
  await comparison.idle();
  const document = frame.contentDocument;
  await document.fonts.ready;
  const view = document.querySelector('#view');
  const snapshot = formSnapshot(view, document.querySelector('#form'));
  snapshot.css = styleSnapshot(view);
  snapshot.data = comparison.encodedData();
  snapshot.focus = comparison.focusState();
  snapshot.response = response;
  return snapshot;
}

/** Compare both frames as they finished loading. */
async function compareMounted() {
  renderInitialization([{
    label: 'mounted',
    results: compareSnapshots(await capture(csrFrame), await capture(ssrFrame), initializationCategories),
  }]);
}

/**
 * Run every stage in the `ssr` column, reset, then in the `csr` column with the same
 * row keys. Each `csr` stage is compared with the stored `ssr` stage without normalization.
 */
async function compareInitialization() {
  const comparisons = [];
  const stages = [];
  const cssFailures = {};
  const compare = (label, actual, expected) => {
    const results = compareSnapshots(actual, expected, initializationCategories);
    comparisons.push({ label, results });
    if (results.some(result => result.category === 'css' && !result.passed)) {
      cssFailures[label] = { expected: expected.css, actual: actual.css };
    }
    renderInitialization(comparisons);
  };
  let expected;
  for (const [index, column] of formInitializations.entries()) {
    const comparison = frames[index].contentWindow.comparison;
    const own = new Map();
    try {
      for (const stage of initializationStages) {
        document.querySelector('#initialization-status').textContent =
          `${t[`${column}Initialization`]} · ${stage}`;
        const snapshot = await capture(frames[index], await comparison.initializationStage(stage));
        const { css, ...state } = snapshot;
        stages.push({ column, stage, ...state, cssHash: await snapshotHash(css) });
        own.set(stage, snapshot);
        if (expected) compare(stage, snapshot, expected.get(stage));
        const attempt = /^reinjected-(\d)$/.exec(stage)?.[1];
        if (attempt) compare(`${column}/idempotence-${attempt}`, snapshot, own.get('mounted'));
        if (stage === 'data-restored') compare(`${column}/restoration`, snapshot, own.get('mounted'));
      }
    } finally {
      comparison.endInitialization();
    }
    expected = own;
  }
  if (JSON.stringify(comparisons.map(item => item.label)) !== JSON.stringify(initializationComparisons)) {
    throw new Error('Initialization comparison order differs');
  }
  renderInitialization(comparisons);
  return { comparisons, stages, cssFailures };
}

function renderInitialization(comparisons) {
  const output = document.querySelector('#initialization-results');
  const results = comparisons.flatMap(comparison => comparison.results);
  document.querySelector('#initialization-status').textContent =
    `${results.filter(result => result.passed).length}/${results.length} ${t.initializationSummary}`;
  output.replaceChildren(...comparisons.map(comparison => {
    const failed = comparison.results.filter(result => !result.passed);
    const line = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = failed.length ? 'fail' : 'pass';
    summary.textContent = `${failed.length ? t.fail : t.pass} · ${comparison.label} · `
      + comparison.results.map(result => `${result.category} ${result.passed ? t.pass : t.fail}`).join(', ');
    line.append(summary);
    for (const result of failed) {
      const raw = document.createElement('pre');
      raw.textContent = result.error;
      line.append(raw);
    }
    return line;
  }));
}

async function initializationReport(server, path, framework) {
  const { comparisons, stages, cssFailures } = await compareInitialization();
  return {
    kind: 'initialization', server, path, framework,
    source: ssrFrame.contentWindow.comparison.source,
    results: comparisons.flatMap(comparison => comparison.results.map(result =>
      ({ label: comparison.label, ...result }))),
    stages, cssFailures,
  };
}

function renderReport() {
  const visible = reports.filter(report => report.kind === 'scenario'
    && report.server === serverSelector.value && report.framework === frameworkSelector.value);
  if (!visible.length) {
    document.querySelector('#report').replaceChildren();
    return;
  }
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  const labels = [t.results, ...visible.map(report =>
    `${t.serverNames[report.server]} / ${t[report.path]} / ${report.framework} / ${t[`${report.transport}Transport`]}`)];
  for (const label of labels) {
    const th = document.createElement('th');
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const check of visible[0].results) {
    const row = body.insertRow();
    row.insertCell().textContent = t[check.id];
    for (const report of visible) {
      const item = report.results.find(result => result.id === check.id);
      const cell = row.insertCell();
      cell.textContent = item.passed ? t.pass : t.fail;
      cell.className = item.passed ? 'pass' : 'fail';
      if (item.error) {
        const detail = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = t.failureDetails;
        const raw = document.createElement('pre');
        raw.textContent = item.error;
        detail.append(summary, raw);
        cell.append(detail);
      }
    }
  }
  document.querySelector('#report').replaceChildren(table);
}

async function show(framework, server = serverSelector.value, path = pathSelector.value) {
  if (!formFrameworks.includes(framework) || !formServers.includes(server)
      || !formRenderingPaths.includes(path)) {
    throw new Error('Unknown form selection');
  }
  serverSelector.value = server;
  frameworkSelector.value = framework;
  pathSelector.value = path;
  document.querySelector('#language').href =
    `?lang=${language === 'ko' ? 'en' : 'ko'}&server=${server}`;
  document.querySelector('#initialization-results').replaceChildren();
  const ready = [];
  await loadComparisonFrames({
    host: window, frames, initializations: formInitializations, path, framework, server, language,
    title: initialization => t[`${initialization}Initialization`],
    onReady: initialization => {
      ready.push(initialization);
      if (ready.length < frames.length) {
        document.querySelector('#initialization-status').textContent =
          `${t[`${initialization}Initialization`]} · ${t.initializationWaiting}`;
      }
    },
  });
  await compareMounted();
  renderReport();
}

async function runAll(servers, publish) {
  if (running) throw new Error('Checks already running');
  running = true;
  reports = [];
  const selected = [frameworkSelector.value, serverSelector.value, pathSelector.value];
  const controls = ['#server', '#framework', '#path', '#all-checks', '#initialization-check']
    .map(selector => document.querySelector(selector));
  for (const control of controls) control.disabled = true;
  try {
    for (const server of servers) {
      for (const framework of formFrameworks) {
        for (const path of formRenderingPaths) {
          document.querySelector('#progress').textContent =
            `${t.running} ${t.serverNames[server]} / ${framework} / ${path}`;
          await show(framework, server, path);
          reports.push(await publish([server, path, framework, 'initialization'].join('/'), () =>
            initializationReport(server, path, framework)));
          for (const transport of formTransports) {
            reports.push(await publish([server, path, framework, transport].join('/'), () =>
              ssrFrame.contentWindow.comparison.runChecks(transport)));
          }
          renderReport();
        }
      }
    }
    const checks = reports.flatMap(report => report.results);
    document.querySelector('#progress').textContent =
      `${t.results}: ${checks.filter(check => check.passed).length}/${checks.length} ${t.pass}`;
    document.querySelector('#download').disabled = false;
    return { generatedAt: new Date().toISOString(), source: metadata };
  } finally {
    await show(...selected);
    for (const control of controls) control.disabled = false;
    running = false;
  }
}

function startRun(servers = formServers) {
  if (!Array.isArray(servers) || servers.length === 0
      || servers.some(server => !formServers.includes(server))) {
    throw new Error('Expected one or more supported servers');
  }
  if (activeJob?.state().status === 'running') throw new Error('Checks already running');
  activeJob = createBrowserJob(({ report }) => runAll(servers, report), {
    totalReports: formRenderingPaths.length * formFrameworks.length
      * (1 + formTransports.length) * servers.length,
    publish: event => window.cruduiBrowserJobEvent?.(event),
  });
  return activeJob.start();
}

function runState() {
  return activeJob?.state()
    ?? { status: 'idle', completedReports: 0, totalReports: 0, current: null };
}
function runReport(index) { return activeJob?.report(index); }

for (const selector of [serverSelector, frameworkSelector, pathSelector]) {
  selector.addEventListener('change', () => show(frameworkSelector.value));
}
document.querySelector('#initialization-check').addEventListener('click', async () => {
  try {
    await compareInitialization();
  } catch (error) {
    document.querySelector('#initialization-status').textContent = error.message;
  }
});
document.querySelector('#all-checks').addEventListener('click', () => {
  try {
    startRun();
    activeJob.completion().catch(error => {
      document.querySelector('#progress').textContent = error.message;
    });
  } catch (error) {
    document.querySelector('#progress').textContent = error.message;
  }
});
document.querySelector('#download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ metadata, reports })],
    { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'crudui-form-results.json';
  link.click();
  URL.revokeObjectURL(url);
});

await show('react');
window.comparison = { startRun, runState, runReport, show, getReports: () => reports };
window.postMessage({
  type: 'crudui:main-ready', server: initialServer, framework: 'react',
}, location.origin);
