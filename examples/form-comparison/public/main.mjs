import { frameUrl } from './frame-readiness.mjs';
// Form frames use the owned readiness contract from loadComparisonFrames.
import { formFrameworks, formInitializations, pipelineServers } from './runtime-paths.mjs';

const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const query = new URLSearchParams(location.search);
const state = {
  language, server: pipelineServers.includes(query.get('server')) ? query.get('server') : 'js',
  framework: formFrameworks.includes(query.get('framework')) ? query.get('framework') : 'html',
  initialization: formInitializations.includes(query.get('initialization')) ? query.get('initialization') : 'csr',
  stage: ['list', 'detail', 'form', 'refresh'].includes(query.get('stage')) ? query.get('stage') : 'list',
  id: query.get('id') || '1',
};
const text = {
  ko: { title: 'CRUDUI 파이프라인 예제', intro: '목록에서 상세로 이동하고, 같은 레코드를 폼에서 저장한 뒤 목록을 갱신합니다.', server: '서버', framework: '클라이언트', initialization: '실행 방식', list: '고객 목록', detail: '고객 상세', form: '고객 수정', open: '상세 보기', edit: '수정', source: '소스 식별자', ssr: 'SSR', csr: 'CSR' },
  en: { title: 'CRUDUI pipeline example', intro: 'Open a detail from the list, edit the same record, save it, and refresh the list.', server: 'Server', framework: 'Client', initialization: 'Execution', list: 'Customer list', detail: 'Customer detail', form: 'Edit customer', open: 'Open detail', edit: 'Edit', source: 'Source identity', ssr: 'SSR', csr: 'CSR' },
}[language];
const $ = selector => document.querySelector(selector);
document.documentElement.lang = language;
for (const id of ['title', 'intro', 'server-label', 'framework-label', 'initialization-label']) $(`#${id}`).textContent = text[id];
$('#source-label').textContent = text.source;
$('#language').textContent = language === 'ko' ? 'English' : '한국어';
$('#language').href = `/?lang=${language === 'ko' ? 'en' : 'ko'}&server=${state.server}&framework=${state.framework}&initialization=${state.initialization}&id=${state.id}&stage=${state.stage}`;
$('#server').value = state.server; $('#framework').value = state.framework; $('#initialization').value = state.initialization;
const records = await (await fetch('/pipeline-records.json', { cache: 'no-store' })).json();
const record = () => records.find(item => item.id === state.id) || records[0];
function link(stage, id = state.id) { const params = new URLSearchParams({ lang: language, server: state.server, framework: state.framework, initialization: state.initialization, id, stage }); return `/?${params}`; }
function money(value) { return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`; }
function renderList() {
  const rows = records.map(item => `<tr><td>${item.name}</td><td>${item.status}</td><td>${item.joined}</td><td>${money(item.score)}</td><td><a href="${link('detail', item.id)}">${text.open}</a></td></tr>`).join('');
  $('#stage').innerHTML = `<div class="stage-heading"><p class="eyebrow">LIST</p><h2>${text.list}</h2><p>${text.intro}</p></div><div class="data-card"><table><thead><tr><th>Name</th><th>Status</th><th>Joined</th><th>Score</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderDetail() {
  const item = record();
  $('#stage').innerHTML = `<div class="stage-heading"><p class="eyebrow">DETAIL</p><h2>${text.detail}</h2></div><article class="data-card detail-card"><dl><dt>Name</dt><dd>${item.name}</dd><dt>Status</dt><dd>${item.status}</dd><dt>Joined</dt><dd>${item.joined}</dd><dt>Score</dt><dd>${money(item.score)}</dd></dl><a class="primary" href="${link('form')}">${text.edit}</a></article>`;
}
function renderForm() {
  $('#stage').hidden = true; $('#form-stage').hidden = false;
  $('#form-title').textContent = text.form;
  $('#form-help').textContent = `${text.server}: ${state.server} · ${text.framework}: ${state.framework} · ${text[state.initialization]}`;
  const selected = state.initialization === 'ssr' ? $('#ssr') : $('#csr');
  for (const frame of [$('#ssr'), $('#csr')]) frame.hidden = frame !== selected;
  selected.title = text[state.initialization];
  selected.src = frameUrl({ initialization: state.initialization, path: 'bindForm', framework: state.framework, server: state.server, language });
}
function render() {
  $('#stage').hidden = false; $('#form-stage').hidden = true;
  for (const button of document.querySelectorAll('[data-stage]')) button.classList.toggle('active', button.dataset.stage === state.stage);
  if (state.stage === 'list' || state.stage === 'refresh') renderList(); else if (state.stage === 'detail') renderDetail(); else renderForm();
}
for (const control of ['server', 'framework', 'initialization']) $(`#${control}`).addEventListener('change', event => { state[control] = event.target.value; render(); });
for (const button of document.querySelectorAll('[data-stage]')) button.addEventListener('click', () => { state.stage = button.dataset.stage === 'save' ? 'form' : button.dataset.stage; render(); });
const source = await (await fetch('/source.json', { cache: 'no-store' })).json(); $('#source').textContent = JSON.stringify(source, null, 2);
render();
window.postMessage({ type: 'crudui:main-ready', server: state.server, framework: state.framework }, location.origin);
