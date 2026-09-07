import { translations } from './text.mjs';
const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const t = translations(language);
const selector = document.querySelector('#framework');
const serverSelector = document.querySelector('#server');
const initialServer = new URLSearchParams(location.search).get('server') ?? 'php';
if (!['php', 'go', 'rust'].includes(initialServer)) throw new Error('Unknown server');
serverSelector.value = initialServer;
const variant = document.querySelector('#variant');
const frames = ['original', 'keyed'].map(mode => document.querySelector(`#${mode}`));
let reports = [];
let running = false;
for (const id of ['title', 'intro', 'manual', 'download']) document.querySelector(`#${id}`).textContent = t[id];
document.querySelector('#framework-label').textContent = t.framework;
document.querySelector('#server-label').textContent = t.server;
document.querySelector('#comparison-label').textContent = t.comparison;
for (const option of variant.options) option.textContent = t[option.value];
document.querySelector('#all-checks').textContent = t.allChecks;
document.querySelector('#source-label').textContent = t.source;
document.querySelector('#language').textContent = language === 'ko' ? 'English' : '한국어';
document.documentElement.lang = language;
const metadata = await (await fetch('/metadata.json')).json();
document.querySelector('#source').textContent = JSON.stringify(metadata, null, 2);

async function show(framework, originalMode = variant.value, server = serverSelector.value) {
  serverSelector.value = server;
  document.querySelector('#language').href = `?lang=${language === 'ko' ? 'en' : 'ko'}&server=${server}`;
  selector.value = framework;
  variant.value = originalMode;
  const modes = [originalMode, 'keyed'];
  const loaded = frames.map(frame => new Promise(resolve => frame.addEventListener('load', resolve, { once: true })));
  for (const [index, mode] of modes.entries()) {
    frames[index].title = t[mode];
    frames[index].src = `/frames/${mode}-${framework}/?lang=${language}&server=${server}`;
  }
  await Promise.all(loaded);
  for (let attempt = 0; attempt < 300; attempt++) {
    if (frames.every((frame, index) => frame.contentWindow.comparison?.server === server && frame.contentWindow.comparison?.framework === framework && frame.contentWindow.comparison?.mode === modes[index])) { renderReport(); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Frames did not load: ${framework}`);
}
function renderReport() {
  const visible = reports.filter(report => report.server === serverSelector.value && report.framework === selector.value);
  if (!visible.length) { document.querySelector('#report').replaceChildren(); return; }
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const label of [t.results, ...visible.map(report => `${t.serverNames[report.server]} / ${t[report.mode]} / ${report.framework} / ${t[`${report.transport}Transport`]}`)]) {
    const th = document.createElement('th'); th.textContent = label; head.append(th);
  }
  const body = table.createTBody();
  for (const check of visible[0]?.results ?? []) {
    const row = body.insertRow(); row.insertCell().textContent = t[check.id];
    for (const report of visible) {
      const item = report.results.find(result => result.id === check.id);
      const cell = row.insertCell();
      cell.textContent = item.passed ? t.pass : t.fail;
      cell.className = item.passed ? 'pass' : 'fail';
      if (item.error) {
        const explanation = t.failureNotes[report.mode]?.[check.id];
        if (explanation) { const note = document.createElement('p'); note.textContent = explanation; cell.append(note); }
        const detail = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = t.failureDetails;
        const raw = document.createElement('pre'); raw.textContent = item.error;
        detail.append(summary, raw); cell.append(detail);
      }
    }
  }
  document.querySelector('#report').replaceChildren(table);
}
async function runAll(servers = ['php', 'go', 'rust']) {
  if (running) throw new Error('Checks already running');
  running = true; reports = [];
  const selectedComparison = variant.value;
  const selectedServer = serverSelector.value;
  const selectedFramework = selector.value;
  serverSelector.disabled = true;
  selector.disabled = true;
  variant.disabled = true;
  document.querySelector('#all-checks').disabled = true;
  try {
    for (const server of servers) {
    for (const framework of ['react', 'vue', 'svelte']) {
      document.querySelector('#progress').textContent = `${t.running} ${t.serverNames[server]} / ${framework}`;
      await show(framework, 'corrected', server);
      for (const frame of frames) {
        for (const method of ['form', 'json']) reports.push(await frame.contentWindow.comparison.runChecks(method));
      }
      for (const diagnostic of ['original-keyed', 'original']) {
        await show(framework, diagnostic);
        for (const method of ['form', 'json']) reports.push(await frames[0].contentWindow.comparison.runChecks(method));
      }
      renderReport();
    }
    }
    const checks = reports.flatMap(report => report.results);
    document.querySelector('#progress').textContent = `${t.results}: ${checks.filter(check => check.passed).length}/${checks.length} ${t.pass}`;
    document.querySelector('#download').disabled = false;
    return { generatedAt: new Date().toISOString(), metadata, reports };
  } finally {
    await show(selectedFramework, selectedComparison, selectedServer);
    renderReport();
    serverSelector.disabled = false;
    running = false; selector.disabled = false; variant.disabled = false;
    document.querySelector('#all-checks').disabled = false;
  }
}
serverSelector.addEventListener('change', () => show(selector.value));
selector.addEventListener('change', () => show(selector.value));
variant.addEventListener('change', () => show(selector.value));
document.querySelector('#all-checks').addEventListener('click', () => runAll().catch(error => { document.querySelector('#progress').textContent = error.message; }));
document.querySelector('#download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ metadata, reports }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'crudui-form-results.json'; link.click();
  URL.revokeObjectURL(url);
});
await show('react');
window.comparison = { runAll, show, getReports: () => reports };
