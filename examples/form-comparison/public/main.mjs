import { createBrowserJob } from './browser-job.mjs';
import {
  formFrameworks, formRenderingPaths, formServers, formTransports,
} from './runtime-paths.mjs';
import { translations } from './text.mjs';

const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const t = translations(language);
const frameworkSelector = document.querySelector('#framework');
const serverSelector = document.querySelector('#server');
const initialServer = new URLSearchParams(location.search).get('server') ?? 'php';
if (!formServers.includes(initialServer)) throw new Error('Unknown server');
serverSelector.value = initialServer;
const frames = formRenderingPaths.map(path => document.querySelector(`#${path}`));
let reports = [];
let running = false;
let activeJob;

for (const id of ['title', 'intro', 'manual', 'download']) {
  document.querySelector(`#${id}`).textContent = t[id];
}
document.querySelector('#framework-label').textContent = t.framework;
document.querySelector('#server-label').textContent = t.server;
document.querySelector('#all-checks').textContent = t.allChecks;
document.querySelector('#source-label').textContent = t.source;
document.querySelector('#language').textContent = language === 'ko' ? 'English' : '한국어';
document.documentElement.lang = language;
for (const option of serverSelector.options) option.textContent = t.serverNames[option.value];
const metadata = await (await fetch('/metadata.json')).json();
document.querySelector('#source').textContent = JSON.stringify(metadata, null, 2);

function renderReport() {
  const visible = reports.filter(report => report.server === serverSelector.value
    && report.framework === frameworkSelector.value);
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
  for (const check of visible[0]?.results ?? []) {
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

async function show(framework, server = serverSelector.value) {
  if (!formFrameworks.includes(framework) || !formServers.includes(server)) {
    throw new Error('Unknown form selection');
  }
  serverSelector.value = server;
  frameworkSelector.value = framework;
  document.querySelector('#language').href =
    `?lang=${language === 'ko' ? 'en' : 'ko'}&server=${server}`;
  const loaded = frames.map(frame =>
    new Promise(resolve => frame.addEventListener('load', resolve, { once: true })));
  for (const [index, path] of formRenderingPaths.entries()) {
    frames[index].title = t[path];
    frames[index].src = `/frames/${path}-${framework}/?lang=${language}&server=${server}`;
  }
  await Promise.all(loaded);
  for (let attempt = 0; attempt < 300; attempt++) {
    const ready = frames.every((frame, index) => {
      const comparison = frame.contentWindow.comparison;
      return comparison?.server === server && comparison.framework === framework
        && comparison.path === formRenderingPaths[index];
    });
    if (ready) {
      renderReport();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Frames did not load: ${framework}`);
}

async function runAll(servers, publish) {
  if (running) throw new Error('Checks already running');
  running = true;
  reports = [];
  const selectedServer = serverSelector.value;
  const selectedFramework = frameworkSelector.value;
  serverSelector.disabled = true;
  frameworkSelector.disabled = true;
  document.querySelector('#all-checks').disabled = true;
  try {
    for (const server of servers) {
      for (const framework of formFrameworks) {
        document.querySelector('#progress').textContent =
          `${t.running} ${t.serverNames[server]} / ${framework}`;
        await show(framework, server);
        for (const frame of frames) {
          for (const transport of formTransports) {
            const path = frame.contentWindow.comparison.path;
            const label = [server, path, framework, transport].join('/');
            reports.push(await publish(label, () =>
              frame.contentWindow.comparison.runChecks(transport)));
          }
        }
        renderReport();
      }
    }
    const checks = reports.flatMap(report => report.results);
    document.querySelector('#progress').textContent =
      `${t.results}: ${checks.filter(check => check.passed).length}/${checks.length} ${t.pass}`;
    document.querySelector('#download').disabled = false;
    return { generatedAt: new Date().toISOString(), metadata };
  } finally {
    await show(selectedFramework, selectedServer);
    renderReport();
    serverSelector.disabled = false;
    frameworkSelector.disabled = false;
    document.querySelector('#all-checks').disabled = false;
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
      * formTransports.length * servers.length,
  });
  return activeJob.start();
}

function runState() {
  return activeJob?.state()
    ?? { status: 'idle', completedReports: 0, totalReports: 0, current: null };
}
function runReport(index) { return activeJob?.report(index); }

serverSelector.addEventListener('change', () => show(frameworkSelector.value));
frameworkSelector.addEventListener('change', () => show(frameworkSelector.value));
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
