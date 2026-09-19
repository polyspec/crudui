// The canonical page (docs/spec/form-comparison.md, "Canonical page"): the record flow from the
// list through detail and form back to the saved list, over the selected server, client,
// initialization and form mode. The page owns the selection, its links and the saved notice; the
// selected client's stage module renders or takes over the stage and submits the form.
import { selectionDefaults, selectionQuery } from './record-view.mjs';

const query = new URLSearchParams(location.search);
const view = { '/detail': 'detail', '/form': 'form' }[location.pathname] ?? 'list';
const state = Object.fromEntries(Object.entries(selectionDefaults)
  .map(([member, fallback]) => [member, query.get(member) ?? String(fallback)]));
state.page = Number(state.page);
const id = view === 'list' ? null : query.get('id');
const saved = view === 'list' ? query.get('saved') : null;

const text = {
  ko: {
    title: 'CRUDUI 전체 기능 예제',
    intro: 'CRUDUI가 생성한 목록 링크로 상세와 폼을 열고, 선택한 서버에 저장한 결과를 같은 목록 페이지에서 확인합니다.',
    paginationContract: '호출자가 현재 페이지(page)와 전체 레코드 수(total)를 주입하면 CRUDUI가 이전·다음·활성 페이지를 렌더링합니다.',
    server: '서버', framework: '클라이언트', initialization: '실행 방식', mode: '폼 방식', source: '소스 식별자',
    list: '고객 목록', detail: '고객 상세', form: '고객 수정', backList: '목록으로 돌아가기', language: 'English',
    steps: { list: '목록', detail: '상세', form: '폼' },
    saved: record => `레코드 ${record}을(를) 저장했습니다.`,
    invalid: '입력값을 확인하세요.',
  },
  en: {
    title: 'CRUDUI full feature example',
    intro: 'Open detail and form through CRUDUI-generated list links, save to the selected server and see the result on the same list page.',
    paginationContract: 'The caller injects the current page (page) and total record count (total); CRUDUI renders previous, next and active page controls.',
    server: 'Server', framework: 'Client', initialization: 'Execution', mode: 'Form mode', source: 'Source identity',
    list: 'Customer list', detail: 'Customer detail', form: 'Edit customer', backList: 'Back to list', language: '한국어',
    steps: { list: 'List', detail: 'Detail', form: 'Form' },
    saved: record => `Saved record ${record}.`,
    invalid: 'Check the entered values.',
  },
}[state.lang];
if (!text) throw new Error(`Unknown language: ${state.lang}`);

const $ = selector => document.querySelector(selector);
/** The query of this page with the given selection members changed; detail and form keep their id. */
function params(overrides = {}, recordId = id) {
  const selection = {
    lang: state.lang, server: state.server, framework: state.framework,
    initialization: state.initialization, mode: state.mode, page: state.page, ...overrides,
  };
  return `${recordId === null ? '' : `id=${encodeURIComponent(recordId)}&`}${selectionQuery(selection)}`;
}
const address = (target, recordId) => `${target === 'list' ? '/' : `/${target}`}?${params({}, target === 'list' ? null : recordId)}`;

document.documentElement.lang = state.lang;
document.title = text.title;
$('#title').textContent = text.title;
$('#intro').textContent = text.intro;
$('#pagination-contract').textContent = text.paginationContract;
for (const control of ['server', 'framework', 'initialization', 'mode']) {
  $(`#${control}-label`).textContent = text[control];
  $(`#${control}`).value = state[control];
}
$('#source-label').textContent = text.source;
$('#back-list').textContent = `← ${text.backList}`;
$('#back-list').hidden = view === 'list';
$('#view-step').textContent = text.steps[view].toUpperCase();
$('#view-title').textContent = text[view];
const language = $('#language');
language.textContent = text.language;
language.href = `${location.pathname}?${params({ lang: state.lang === 'ko' ? 'en' : 'ko' })}`;
for (const link of document.querySelectorAll('[data-link]')) {
  const target = link.dataset.link;
  if (link.closest('.pipeline-nav')) link.textContent = text.steps[target];
  if (target === view) link.setAttribute('aria-current', 'page');
  if (target === 'list' || id !== null) link.href = address(target, id);
  else link.removeAttribute('href');
}
for (const control of ['server', 'framework', 'initialization', 'mode']) {
  $(`#${control}`).addEventListener('change', event => {
    state[control] = event.target.value;
    location.href = `${location.pathname}?${params()}`;
  });
}

const stage = $('#stage');
if (view === 'list') {
  stage.addEventListener('click', event => {
    const button = event.target.closest('.crudui-list__pagination button[data-page]');
    if (button && !button.disabled) location.href = `/?${params({ page: Number(button.dataset.page) })}`;
  });
  if (saved !== null) {
    let notice = $('#saved-notice');
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'saved-notice';
      notice.setAttribute('role', 'status');
      notice.dataset.recordId = saved;
      stage.before(notice);
    }
    notice.className = 'saved-notice';
    notice.textContent = text.saved(saved);
  }
}

// The document names the selection it was rendered for; a document of another selection fails
// instead of taking over foreign stage markup.
const rendered = JSON.parse(document.documentElement.dataset.pipelineSelection ?? '{}');
for (const member of ['lang', 'server', 'framework', 'initialization', 'mode']) {
  if (rendered[member] !== state[member]) {
    throw new Error(`The document was rendered for ${member}=${rendered[member]}, not ${member}=${state[member]}`);
  }
}
const { startStage } = await import(`/pages/${encodeURIComponent(state.framework)}/stage.js`);
const [source] = await Promise.all([
  fetch('/source.json', { cache: 'no-store' }).then(response => response.json()),
  startStage({ stage, view, selection: state, id, text }),
]);
$('#source').textContent = JSON.stringify(source, null, 2);
window.postMessage({
  type: 'crudui:pipeline-ready', view, server: state.server, framework: state.framework,
  initialization: state.initialization, mode: state.mode, page: state.page, id,
}, location.origin);
