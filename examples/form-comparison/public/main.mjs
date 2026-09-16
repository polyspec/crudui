import { frameUrl } from './frame-readiness.mjs';
import { formFrameworks, formInitializations, pipelineServers } from './runtime-paths.mjs';

const query = new URLSearchParams(location.search);
const state = {
  language: query.get('lang') === 'en' ? 'en' : 'ko',
  server: pipelineServers.includes(query.get('server')) ? query.get('server') : 'js',
  framework: formFrameworks.includes(query.get('framework')) ? query.get('framework') : 'html',
  initialization: formInitializations.includes(query.get('initialization')) ? query.get('initialization') : 'csr',
  id: query.get('id') || '1',
  page: query.get('page') || '1',
};
const view = ['/detail', '/detail/'].includes(location.pathname) ? 'detail' : ['/form', '/form/'].includes(location.pathname) ? 'form' : 'list';
const text = {
  ko: { title: 'CRUDUI 전체 기능 예제', intro: 'CRUDUI가 생성한 목록 링크로 상세와 폼으로 이동하고 실제 저장 결과를 다시 목록에서 확인합니다.', paginationContract: '호출자가 현재 페이지(page)와 전체 레코드 수(total)를 주입하면 CRUDUI가 이전·다음·활성 페이지를 렌더링합니다.', server: '서버', framework: '클라이언트', initialization: '실행 방식', list: '고객 목록', detail: '고객 상세', form: '고객 수정', source: '소스 식별자', ssr: 'SSR', csr: 'CSR', backList: '목록으로 돌아가기' },
  en: { title: 'CRUDUI full feature example', intro: 'Use CRUDUI-generated list links to open detail and form, then verify the saved result in the list.', paginationContract: 'The caller injects the current page (page) and total record count (total); CRUDUI renders previous, next and active page controls.', server: 'Server', framework: 'Client', initialization: 'Execution', list: 'Customer list', detail: 'Customer detail', form: 'Edit customer', source: 'Source identity', ssr: 'SSR', csr: 'CSR', backList: 'Back to list' },
}[state.language];
const $ = selector => document.querySelector(selector);
document.documentElement.lang = state.language;
$('#title').textContent = text.title; $('#intro').textContent = text.intro;
$('#pagination-contract').textContent = text.paginationContract;
$('#server-label').textContent = text.server; $('#framework-label').textContent = text.framework; $('#initialization-label').textContent = text.initialization;
$('#source-label').textContent = text.source;
$('#back-list').textContent = text.backList;
$('#server').value = state.server; $('#framework').value = state.framework; $('#initialization').value = state.initialization;
function params(overrides = {}) { return new URLSearchParams({ lang: state.language, server: state.server, framework: state.framework, initialization: state.initialization, page: state.page, ...overrides }).toString(); }
for (const link of document.querySelectorAll('[data-view]')) {
  link.href = `/${link.dataset.view === 'list' ? '' : link.dataset.view}?${params({ id: state.id })}`;
  if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
}
for (const control of ['server', 'framework', 'initialization']) $(`#${control}`).addEventListener('change', event => {
  state[control] = event.target.value;
  location.href = `${location.pathname}?${params({ id: state.id })}`;
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'crudui:pipeline-saved') return;
  location.href = `/?${params({ id: state.id, saved: '1' })}`;
});

function bindPagination() {
  if (view !== 'list') return;
  $('#stage').querySelector('.crudui-list__pagination')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (button && !button.disabled) location.href = `/?${params({ page: button.dataset.page })}`;
  });
}

// The benchmark's loadComparisonFrames observes this owned main-page readiness event.
async function renderView() {
  if (view === 'form') {
    $('#stage').hidden = true; $('#form-stage').hidden = false; $('#form-title').textContent = text.form;
    $('#form-help').textContent = `${text.server}: ${state.server} · ${text.framework}: ${state.framework} · ${text[state.initialization]}`;
    $('#form-frame').src = frameUrl({ initialization: state.initialization, path: 'bindForm', framework: state.framework, server: state.server, language: state.language });
    return;
  }
  if (document.documentElement.dataset.pipelineInitialization === 'ssr') return;
  const response = await fetch(`/api/pipeline/${view}?${params({ id: state.id })}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`CRUDUI ${view} request failed: ${response.status}`);
  const body = await response.text();
  $('#stage').innerHTML = `<div class="stage-heading"><p class="eyebrow">${view.toUpperCase()}</p><h2>${text[view]}</h2><p>${text.intro}</p></div>${body}`;
}
const source = await (await fetch('/source.json', { cache: 'no-store' })).json(); $('#source').textContent = JSON.stringify(source, null, 2);
await renderView();
bindPagination();
window.postMessage({ type: 'crudui:main-ready', server: state.server, framework: state.framework, view }, location.origin);
