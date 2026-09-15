import { frameUrl } from './frame-readiness.mjs';
import { formFrameworks, formInitializations, pipelineServers } from './runtime-paths.mjs';

const query = new URLSearchParams(location.search);
const state = {
  language: query.get('lang') === 'en' ? 'en' : 'ko',
  server: pipelineServers.includes(query.get('server')) ? query.get('server') : 'js',
  framework: formFrameworks.includes(query.get('framework')) ? query.get('framework') : 'html',
  initialization: formInitializations.includes(query.get('initialization')) ? query.get('initialization') : 'csr',
  id: query.get('id') || '1',
};
const view = ['/detail', '/detail/'].includes(location.pathname) ? 'detail' : ['/form', '/form/'].includes(location.pathname) ? 'form' : 'list';
const text = {
  ko: { title: 'CRUDUI 전체 기능 예제', intro: 'CRUDUI가 생성한 목록 링크로 상세와 폼으로 이동하고 실제 저장 결과를 다시 목록에서 확인합니다.', server: '서버', framework: '클라이언트', initialization: '실행 방식', list: '고객 목록', detail: '고객 상세', form: '고객 수정', source: '소스 식별자', ssr: 'SSR', csr: 'CSR' },
  en: { title: 'CRUDUI full feature example', intro: 'Use CRUDUI-generated list links to open detail and form, then verify the saved result in the list.', server: 'Server', framework: 'Client', initialization: 'Execution', list: 'Customer list', detail: 'Customer detail', form: 'Edit customer', source: 'Source identity', ssr: 'SSR', csr: 'CSR' },
}[state.language];
const $ = selector => document.querySelector(selector);
document.documentElement.lang = state.language;
$('#title').textContent = text.title; $('#intro').textContent = text.intro;
$('#server-label').textContent = text.server; $('#framework-label').textContent = text.framework; $('#initialization-label').textContent = text.initialization;
$('#source-label').textContent = text.source;
$('#server').value = state.server; $('#framework').value = state.framework; $('#initialization').value = state.initialization;
function params(overrides = {}) { return new URLSearchParams({ lang: state.language, server: state.server, framework: state.framework, initialization: state.initialization, ...overrides }).toString(); }
for (const control of ['server', 'framework', 'initialization']) $(`#${control}`).addEventListener('change', () => { location.href = `${location.pathname}?${params({ id: state.id })}`; });
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'crudui:pipeline-saved') return;
  location.href = `/?${params({ id: state.id, saved: '1' })}`;
});

// The benchmark's loadComparisonFrames observes this owned main-page readiness event.
async function renderView() {
  if (view === 'form') {
    $('#stage').hidden = true; $('#form-stage').hidden = false; $('#form-title').textContent = text.form;
    $('#form-help').textContent = `${text.server}: ${state.server} · ${text.framework}: ${state.framework} · ${text[state.initialization]}`;
    const selected = state.initialization === 'ssr' ? $('#ssr') : $('#csr');
    for (const frame of [$('#ssr'), $('#csr')]) frame.hidden = frame !== selected;
    selected.src = frameUrl({ initialization: state.initialization, path: 'bindForm', framework: state.framework, server: state.server, language: state.language });
    return;
  }
  const response = await fetch(`/api/pipeline/${view}?${params({ id: state.id })}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`CRUDUI ${view} request failed: ${response.status}`);
  $('#stage').innerHTML = `<div class="stage-heading"><p class="eyebrow">${view.toUpperCase()}</p><h2>${text[view]}</h2><p>${text.intro}</p></div>${await response.text()}`;
}
const source = await (await fetch('/source.json', { cache: 'no-store' })).json(); $('#source').textContent = JSON.stringify(source, null, 2);
await renderView();
window.postMessage({ type: 'crudui:main-ready', server: state.server, framework: state.framework, view }, location.origin);
