/**
 * Cross-Check Console — client entry.
 *
 * Single-page, no-build vanilla ES module. Two tabs over three gateway endpoints:
 *   form tab
 *     POST /api/validate    {spec, data, files?, basepath?} → 4-language CRUDUI validation
 *     POST /api/render      {spec, data, options}           → 3-framework CRUDUI form SSR
 *   list tab
 *     POST /api/validate-list {listSpec, files?, basepath?}  → 4-language CRUDUI list
 *       STRUCTURE validation (compose → forbidden-scan; no rows — a list has no
 *       data). The validate sister of /api/validate, reusing the SAME 4-language
 *       idempotency matrix the form tab draws.
 *     POST /api/render-list {listSpec, rows, options}        → 3-framework CRUDUI list SSR
 *     POST /api/render      {spec:<listSpec.search>, ...}    → the SAME form SSR,
 *       reused to render the list-spec's embedded search form ABOVE the list. The
 *       search slot IS a form-spec; the list tab proves it round-trips through the
 *       form endpoint unchanged.
 *
 * Every endpoint always returns HTTP 200 (the {error} envelope is server-only);
 * a failed VALIDATION is data, not an HTTP error. The console computes
 * idempotent (4 langs agree) and parity (3 frameworks agree) itself, then
 * exposes the raw server response so its OWN judgement can be re-checked.
 *
 * Contract details and example provenance live in README.md / examples.js.
 */

import yaml from 'js-yaml';
import { examples, defaultExampleId } from './examples.js';
import { listExamples, defaultListExampleId } from './examples.js';
import { docSections, listDocSections } from './doc.js';

// Gateway base. Same origin when the gateway serves this client statically;
// override with ?api=http://host:port for split deploys.
const API_BASE = new URLSearchParams(location.search).get('api') || '';

const VALIDATE_LANGS = ['js', 'php', 'go', 'rust'];
const RENDER_FWS = ['react', 'vue', 'svelte'];

const LANG_COLOR = {
  js: '#68a063',
  php: '#777bb4',
  go: '#00add8',
  rust: '#dea584',
};
const FW_COLOR = {
  react: '#61dafb',
  vue: '#42b883',
  svelte: '#ff3e00',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  tab: 'form', // 'form' | 'list'
  specText: '',
  dataText: '{}',
  language: 'ko', // options.language
  unsupported: 'throw', // options.unsupported: throw | marker
  raw: false, // raw toggle: show server response verbatim
  docOpen: false,
  running: false,
  validate: null, // last /api/validate response
  render: null, // last /api/render response
  lastError: null, // network/transport error string

  // ---- list tab (parallel to the form tab; never crosses into it) ----
  listSpecText: '', // list-spec YAML (columns + optional embedded search form)
  rowsText: '[]', // injected display rows (JSON array)
  listRunning: false,
  listValidate: null, // last /api/validate-list response (4-language list structure)
  listRender: null, // last /api/render-list response
  searchRender: null, // last /api/render of listSpec.search (form reuse)
  listError: null, // network/transport error string (list tab)
};

// Apply the default example up front so the console is non-empty on first paint.
(() => {
  const ex = examples.find((e) => e.id === defaultExampleId) || examples[0];
  state.specText = ex.spec;
  state.dataText = ex.data;
  state.language = ex.options.language;
  state.unsupported = ex.options.unsupported;

  const lex = listExamples.find((e) => e.id === defaultListExampleId) || listExamples[0];
  state.listSpecText = lex.spec;
  state.rowsText = lex.rows;
})();

// ---------------------------------------------------------------------------
// Parsing helpers (parse failure → red badge + disabled run, per spec)
// ---------------------------------------------------------------------------

/** Parse the YAML spec. Returns { ok, value?, error? }. */
function parseSpec() {
  try {
    const value = yaml.load(state.specText);
    if (value === null || value === undefined) {
      return { ok: false, error: 'empty document' };
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Parse the JSON data. Returns { ok, value?, error? }. */
function parseData() {
  const text = state.dataText.trim();
  if (text === '') return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Parse the list-spec YAML. Returns { ok, value?, error? }. */
function parseListSpec() {
  try {
    const value = yaml.load(state.listSpecText);
    if (value === null || value === undefined) {
      return { ok: false, error: 'empty document' };
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'list-spec must be an object' };
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Parse the injected rows JSON. Must be an array. Returns { ok, value?, error? }. */
function parseRows() {
  const text = state.rowsText.trim();
  if (text === '') return { ok: true, value: [] };
  try {
    const v = JSON.parse(text);
    if (!Array.isArray(v)) return { ok: false, error: 'rows must be a JSON array' };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull the embedded search form-spec out of a parsed list-spec. The `search`
 * slot IS a form-spec; the list renderers ignore it (they read only columns/
 * sort/pagination/empty/actions), so the SAME spec object is what the form
 * endpoint receives — that round-trip is the reuse this tab demonstrates.
 * Returns the form-spec object or null when no search slot is declared.
 */
function extractSearchSpec(listSpecValue) {
  if (!listSpecValue || typeof listSpecValue !== 'object') return null;
  const s = listSpecValue.search;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Normalization for the console's OWN idempotent/parity judgement.
// (The server also reports idempotent/parity; the console recomputes from the
//  raw per-entry results so the badge is independently derived, not trusted.)
// ---------------------------------------------------------------------------

/** Sort errors by (field, rule) and normalize numeric values (f64 drift). */
function normalizeErrors(errors) {
  if (!Array.isArray(errors)) return [];
  const norm = errors.map((e) => ({
    path: e.path ?? e.field ?? '',
    field: e.field ?? e.path ?? '',
    rule: e.rule ?? '',
    message: e.message ?? '',
    value: normalizeValue(e.value),
  }));
  norm.sort((a, b) =>
    a.path === b.path
      ? a.rule.localeCompare(b.rule)
      : a.path.localeCompare(b.path)
  );
  return norm;
}

/** Collapse 5 vs 5.0 etc. so a float serializer difference is not a mismatch. */
function normalizeValue(v) {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return v;
}

/** Stable signature for one validate entry (load error distinct from valid:false). */
function validateSignature(entry) {
  if (!entry || entry.ok === false) return '__error__';
  if (entry.loadError) return `LOAD|${entry.loadError.code}`;
  return JSON.stringify({
    valid: Boolean(entry.valid),
    errors: normalizeErrors(entry.errors),
  });
}

/** Recompute idempotency across the 4 languages from raw entries. */
function computeIdempotent(results) {
  const runnable = results.filter((r) => r && r.ok !== false);
  if (runnable.length < 2) return { idempotent: null, groups: null };
  const sigByLang = {};
  for (const r of results) sigByLang[r.lang] = validateSignature(r);
  const sigs = new Set(runnable.map((r) => validateSignature(r)));
  return { idempotent: sigs.size === 1, groups: sigByLang };
}

/**
 * Recompute parity across the 3 frameworks.
 *
 * Mirrors the server's compareParity (render-runner.mjs) exactly: a SUCCESS
 * framework signs with `html:<normalized>`, a FAILED framework signs with
 * `error:<code>`. A success and an error can never collide (distinct namespaces),
 * so a framework that throws while the others render IS a parity break — it does
 * NOT get silently dropped from the verdict. parity holds iff every framework
 * that produced any result shares one signature.
 *
 * "렌더 성공 < 2" (render_contract): when fewer than two frameworks actually
 * rendered (ok), parity is undetermined → null, not false.
 */
function computeParity(results) {
  const ran = results.filter((r) => r && (r.ok !== false || r.error != null));
  const succeeded = ran.filter((r) => r.ok !== false && r.error == null);
  if (succeeded.length < 2) return { parity: null, groups: null };
  const sigByFw = {};
  for (const r of results) {
    sigByFw[r.fw] = r.error ? `ERROR|${r.error.code}` : `HTML|${r.normalized ?? ''}`;
  }
  const sigs = new Set(
    ran.map((r) => (r.error ? `ERROR|${r.error.code}` : `HTML|${r.normalized ?? ''}`))
  );
  return { parity: sigs.size === 1, groups: sigByFw };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function postJson(pathname, payload) {
  const res = await fetch(API_BASE + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = { error: `non-JSON response (HTTP ${res.status})` };
  }
  if (!res.ok) {
    // Server errors use 4xx/5xx + {error}. Validation/render failures are 200.
    throw new Error(
      `HTTP ${res.status}: ${(body && body.error) || res.statusText}`
    );
  }
  return body;
}

/** Run validate + render in parallel (handleValidateAll pattern). */
async function runAll() {
  const spec = parseSpec();
  const data = parseData();
  if (!spec.ok || !data.ok) return; // run button is disabled in this case anyway

  state.running = true;
  state.lastError = null;
  state.validate = null;
  state.render = null;
  render();

  const options = { language: state.language, unsupported: state.unsupported };
  try {
    const [validateRes, renderRes] = await Promise.all([
      postJson('/api/validate', { spec: spec.value, data: data.value, files: {}, basepath: '' }),
      postJson('/api/render', { spec: spec.value, data: data.value, options }),
    ]);
    state.validate = validateRes;
    state.render = renderRes;
  } catch (e) {
    state.lastError = e.message || String(e);
  } finally {
    state.running = false;
    render();
  }
}

/**
 * List tab runner. Fires the 4-language list STRUCTURE validate AND the list
 * render in parallel, plus — when the list-spec declares a `search` slot — the
 * form render of that slot, so the embedded search form (rendered by the SAME
 * /api/render the form tab uses) shows above the list matrix. The list tab now
 * proves both halves symmetric with the form tab: validate (4 langs) + render (3
 * frameworks). A list-spec with no search slot still validates and renders.
 */
async function runList() {
  const listSpec = parseListSpec();
  const rows = parseRows();
  if (!listSpec.ok || !rows.ok) return; // run button disabled in this case anyway

  state.listRunning = true;
  state.listError = null;
  state.listValidate = null;
  state.listRender = null;
  state.searchRender = null;
  render();

  const options = { language: state.language };
  const searchSpec = extractSearchSpec(listSpec.value);
  try {
    // The 4-language list STRUCTURE validate is fixed at index 0; the list render
    // at index 1; the optional search-form render is appended last so its slot in
    // the destructure stays stable whether or not a search slot is declared.
    const calls = [
      postJson('/api/validate-list', {
        listSpec: listSpec.value,
        files: {},
        basepath: '',
      }),
      postJson('/api/render-list', {
        listSpec: listSpec.value,
        rows: rows.value,
        options,
      }),
    ];
    // Reuse the form endpoint for the embedded search form-spec, unchanged.
    if (searchSpec) {
      calls.push(
        postJson('/api/render', {
          spec: searchSpec,
          data: {},
          options: { language: state.language, unsupported: state.unsupported },
        })
      );
    }
    const [validateRes, listRes, searchRes] = await Promise.all(calls);
    state.listValidate = validateRes;
    state.listRender = listRes;
    state.searchRender = searchRes ?? null;
  } catch (e) {
    state.listError = e.message || String(e);
  } finally {
    state.listRunning = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Fixture export — current (spec,data,options,results) → cases.json shapes.
// validate case: {name,note,spec,data,expected:{valid,errors}}
// form-render case: {name,note,spec,data,options,expected_html}
// Downloaded via the App.tsx Blob pattern.
// ---------------------------------------------------------------------------

function buildFixtureExport() {
  const spec = parseSpec();
  const data = parseData();
  const specObj = spec.ok ? spec.value : null;
  const dataObj = data.ok ? data.value : {};
  const name = (document.getElementById('export-name')?.value || 'live-case').trim();

  const out = {};

  // validate cases: one entry per language so a divergent run is captured per-lang.
  if (state.validate && Array.isArray(state.validate.results)) {
    out.validate = state.validate.results.map((r) => ({
      name: `${name}--${r.lang}`,
      note: `exported from cross-check console (lang=${r.lang}, idempotent=${state.validate.idempotent})`,
      spec: specObj,
      data: dataObj,
      expected: r.loadError
        ? { loadError: r.loadError }
        : { valid: Boolean(r.valid), errors: normalizeErrors(r.errors) },
    }));
  }

  // form-render cases: one per framework, expected_html = normalized.
  if (state.render && Array.isArray(state.render.results)) {
    out.render = state.render.results.map((r) => ({
      name: `${name}--${r.fw}`,
      note: `exported from cross-check console (fw=${r.fw}, parity=${state.render.parity})`,
      spec: specObj,
      data: dataObj,
      options: { language: state.language, unsupported: state.unsupported },
      ...(r.error
        ? { expected_error: r.error }
        : { expected_html: r.normalized ?? '' }),
    }));
  }

  return out;
}

function downloadFixture() {
  const payload = buildFixtureExport();
  const name = (document.getElementById('export-name')?.value || 'live-case').trim();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.cases.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * List fixture export — current (listSpec, rows, options, results) → the
 * tests/fixtures/list-render/cases.json shape, one case per framework:
 *   { name, note, spec, rows, options, expected_html | expected_error }.
 * `spec` carries the list-spec verbatim (including a `search` slot if present);
 * the list conformance reader ignores that slot exactly as the live renderers do.
 */
function buildListFixtureExport() {
  const listSpec = parseListSpec();
  const rows = parseRows();
  const specObj = listSpec.ok ? listSpec.value : null;
  const rowsArr = rows.ok ? rows.value : [];
  const name = (document.getElementById('list-export-name')?.value || 'live-list-case').trim();

  const out = {};
  if (state.listRender && Array.isArray(state.listRender.results)) {
    out.render = state.listRender.results.map((r) => ({
      name: `${name}--${r.fw}`,
      note: `exported from cross-check console (list, fw=${r.fw}, parity=${state.listRender.parity})`,
      spec: specObj,
      rows: rowsArr,
      options: { language: state.language },
      ...(r.error ? { expected_error: r.error } : { expected_html: r.normalized ?? '' }),
    }));
  }
  return out;
}

function downloadListFixture() {
  const payload = buildListFixtureExport();
  const name = (document.getElementById('list-export-name')?.value || 'live-list-case').trim();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.list.cases.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Rendering (vanilla DOM). render() rebuilds from state; editors keep their
// own DOM value so we patch only the result/matrix regions to avoid clobbering
// the textareas mid-typing.
// ---------------------------------------------------------------------------

const root = document.getElementById('app');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let mounted = false;

function render() {
  if (!mounted) {
    mountShell();
    applyTabVisibility();
    mounted = true;
  }
  renderHeaderState();
  renderResults();
}

// One-time shell: header, editors, doc panel, result containers.
function mountShell() {
  root.innerHTML = `
    <header class="cc-header">
      <h1>Cross-Check Console <span class="cc-sub">form-spec</span></h1>
      <nav class="cc-tabs" role="tablist" aria-label="view">
        <button id="tab-form" class="cc-tab" role="tab">form</button>
        <button id="tab-list" class="cc-tab" role="tab">list</button>
      </nav>
      <div class="cc-controls">
        <label class="cc-field" data-tab="form">
          예제
          <select id="example-select"></select>
        </label>
        <label class="cc-field" data-tab="list">
          list 예제
          <select id="list-example-select"></select>
        </label>
        <div class="cc-toggle" role="group" aria-label="language">
          <button id="lang-ko">KO</button>
          <button id="lang-en">EN</button>
        </div>
        <label class="cc-field" data-tab="form">
          unsupported
          <select id="unsupported-select">
            <option value="throw">throw</option>
            <option value="marker">marker</option>
          </select>
        </label>
        <label class="cc-check">
          <input type="checkbox" id="raw-toggle" /> raw
        </label>
        <button id="doc-btn" class="cc-btn cc-btn-ghost">스펙 문법 doc</button>
        <button id="export-btn" class="cc-btn cc-btn-secondary" data-tab="form">픽스처 export</button>
      </div>
    </header>

    <div class="cc-body">
      <aside id="doc-panel" class="cc-doc" hidden></aside>

      <main class="cc-main" id="main-form" data-tab-panel="form">
        <section class="cc-inputs">
          <div class="cc-editor">
            <div class="cc-editor-head">
              <h2>스펙 (YAML)</h2>
              <span id="spec-badge" class="cc-badge"></span>
            </div>
            <textarea id="spec-input" spellcheck="false"></textarea>
          </div>
          <div class="cc-editor">
            <div class="cc-editor-head">
              <h2>데이터 (JSON)</h2>
              <span id="data-badge" class="cc-badge"></span>
            </div>
            <textarea id="data-input" spellcheck="false"></textarea>
          </div>
          <div class="cc-run-row">
            <button id="run-btn" class="cc-btn cc-btn-primary">검증 + 렌더 실행</button>
            <div class="cc-export-inline">
              <input id="export-name" placeholder="export 케이스 이름" value="live-case" />
            </div>
            <span id="run-error" class="cc-run-error"></span>
          </div>
        </section>

        <section class="cc-matrices">
          <div id="validate-matrix" class="cc-matrix"></div>
          <div id="render-matrix" class="cc-matrix"></div>
        </section>
      </main>

      <main class="cc-main" id="main-list" data-tab-panel="list" hidden>
        <section class="cc-inputs">
          <div class="cc-editor">
            <div class="cc-editor-head">
              <h2>list-spec (YAML)</h2>
              <span id="list-spec-badge" class="cc-badge"></span>
            </div>
            <textarea id="list-spec-input" spellcheck="false"></textarea>
          </div>
          <div class="cc-editor">
            <div class="cc-editor-head">
              <h2>rows (JSON 배열, 주입)</h2>
              <span id="rows-badge" class="cc-badge"></span>
            </div>
            <textarea id="rows-input" spellcheck="false"></textarea>
          </div>
          <div class="cc-run-row">
            <button id="list-run-btn" class="cc-btn cc-btn-primary">list 렌더 실행</button>
            <div class="cc-export-inline">
              <input id="list-export-name" placeholder="export 케이스 이름" value="live-list-case" />
            </div>
            <button id="list-export-btn" class="cc-btn cc-btn-secondary">픽스처 export</button>
            <span id="list-run-error" class="cc-run-error"></span>
          </div>
        </section>

        <section class="cc-matrices">
          <div id="list-validate-matrix" class="cc-matrix"></div>
          <div id="search-matrix" class="cc-matrix"></div>
          <div id="list-render-matrix" class="cc-matrix"></div>
        </section>
      </main>
    </div>
  `;

  // Populate form example select.
  const sel = document.getElementById('example-select');
  for (const ex of examples) {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    sel.appendChild(opt);
  }
  sel.value = defaultExampleId;

  // Populate list example select.
  const listSel = document.getElementById('list-example-select');
  for (const ex of listExamples) {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    listSel.appendChild(opt);
  }
  listSel.value = defaultListExampleId;

  // Editors.
  const specInput = document.getElementById('spec-input');
  const dataInput = document.getElementById('data-input');
  specInput.value = state.specText;
  dataInput.value = state.dataText;

  const listSpecInput = document.getElementById('list-spec-input');
  const rowsInput = document.getElementById('rows-input');
  listSpecInput.value = state.listSpecText;
  rowsInput.value = state.rowsText;

  // Doc panel content (renderDocPanel re-fills per active tab).
  renderDocPanel();

  // Wire events.
  sel.addEventListener('change', (e) => {
    const ex = examples.find((x) => x.id === e.target.value);
    if (!ex) return;
    state.specText = ex.spec;
    state.dataText = ex.data;
    state.language = ex.options.language;
    state.unsupported = ex.options.unsupported;
    state.validate = null;
    state.render = null;
    state.lastError = null;
    specInput.value = ex.spec;
    dataInput.value = ex.data;
    document.getElementById('unsupported-select').value = ex.options.unsupported;
    renderHeaderState();
    renderResults();
  });

  specInput.addEventListener('input', (e) => {
    state.specText = e.target.value;
    renderHeaderState();
  });
  dataInput.addEventListener('input', (e) => {
    state.dataText = e.target.value;
    renderHeaderState();
  });

  // List example select.
  listSel.addEventListener('change', (e) => {
    const ex = listExamples.find((x) => x.id === e.target.value);
    if (!ex) return;
    state.listSpecText = ex.spec;
    state.rowsText = ex.rows;
    state.listValidate = null;
    state.listRender = null;
    state.searchRender = null;
    state.listError = null;
    listSpecInput.value = ex.spec;
    rowsInput.value = ex.rows;
    renderHeaderState();
    renderResults();
  });

  listSpecInput.addEventListener('input', (e) => {
    state.listSpecText = e.target.value;
    renderHeaderState();
  });
  rowsInput.addEventListener('input', (e) => {
    state.rowsText = e.target.value;
    renderHeaderState();
  });

  document.getElementById('lang-ko').addEventListener('click', () => {
    state.language = 'ko';
    renderHeaderState();
  });
  document.getElementById('lang-en').addEventListener('click', () => {
    state.language = 'en';
    renderHeaderState();
  });
  document.getElementById('unsupported-select').addEventListener('change', (e) => {
    state.unsupported = e.target.value;
  });
  document.getElementById('raw-toggle').addEventListener('change', (e) => {
    state.raw = e.target.checked;
    renderResults();
  });
  document.getElementById('doc-btn').addEventListener('click', () => {
    state.docOpen = !state.docOpen;
    document.getElementById('doc-panel').hidden = !state.docOpen;
    document.getElementById('doc-btn').classList.toggle('active', state.docOpen);
  });
  document.getElementById('export-btn').addEventListener('click', downloadFixture);
  document.getElementById('run-btn').addEventListener('click', runAll);

  document.getElementById('list-export-btn').addEventListener('click', downloadListFixture);
  document.getElementById('list-run-btn').addEventListener('click', runList);

  // Tab switch — the two panels never share DOM; switching only toggles which
  // <main> is visible and re-themes the per-tab header controls and doc panel.
  document.getElementById('tab-form').addEventListener('click', () => setTab('form'));
  document.getElementById('tab-list').addEventListener('click', () => setTab('list'));
}

/** Switch the active tab and re-render the shell's tab-scoped chrome. */
function setTab(tab) {
  if (state.tab === tab) return;
  state.tab = tab;
  applyTabVisibility();
  renderDocPanel();
  renderHeaderState();
  renderResults();
}

/** Show the active <main>, hide the other, and gate per-tab header controls. */
function applyTabVisibility() {
  document.getElementById('tab-form').classList.toggle('active', state.tab === 'form');
  document.getElementById('tab-list').classList.toggle('active', state.tab === 'list');
  document.getElementById('main-form').hidden = state.tab !== 'form';
  document.getElementById('main-list').hidden = state.tab !== 'list';
  for (const el of document.querySelectorAll('[data-tab]')) {
    el.hidden = el.getAttribute('data-tab') !== state.tab;
  }
}

/** Fill the doc panel with the active tab's sections (form vs list syntax). */
function renderDocPanel() {
  const doc = document.getElementById('doc-panel');
  if (!doc) return;
  const sections = state.tab === 'list' ? listDocSections : docSections;
  const heading = state.tab === 'list' ? 'list-spec 문법 요약' : '스펙 문법 요약';
  doc.innerHTML =
    `<h2>${esc(heading)}</h2>` +
    sections
      .map(
        (s) =>
          `<div class="cc-doc-section"><h3>${esc(s.title)}</h3><p>${esc(
            s.body
          )}</p></div>`
      )
      .join('');
}

function renderHeaderState() {
  // Language toggle active state.
  document.getElementById('lang-ko').classList.toggle('active', state.language === 'ko');
  document.getElementById('lang-en').classList.toggle('active', state.language === 'en');

  // Parse badges + run/export enablement.
  const spec = parseSpec();
  const data = parseData();
  const specBadge = document.getElementById('spec-badge');
  const dataBadge = document.getElementById('data-badge');
  setBadge(specBadge, spec.ok, spec.ok ? 'YAML OK' : `YAML 파싱 실패: ${spec.error}`);
  setBadge(dataBadge, data.ok, data.ok ? 'JSON OK' : `JSON 파싱 실패: ${data.error}`);

  const runnable = spec.ok && data.ok && !state.running;
  const runBtn = document.getElementById('run-btn');
  runBtn.disabled = !runnable;
  runBtn.textContent = state.running ? '실행 중...' : '검증 + 렌더 실행';

  // Export needs at least one set of results.
  const exportBtn = document.getElementById('export-btn');
  exportBtn.disabled = !(state.validate || state.render);

  // ---- list tab badges + run/export gating ----
  const listSpec = parseListSpec();
  const rows = parseRows();
  setBadge(
    document.getElementById('list-spec-badge'),
    listSpec.ok,
    listSpec.ok ? 'YAML OK' : `YAML 파싱 실패: ${listSpec.error}`
  );
  setBadge(
    document.getElementById('rows-badge'),
    rows.ok,
    rows.ok ? `JSON OK (${rows.value.length} rows)` : `JSON 파싱 실패: ${rows.error}`
  );
  const listRunnable = listSpec.ok && rows.ok && !state.listRunning;
  const listRunBtn = document.getElementById('list-run-btn');
  listRunBtn.disabled = !listRunnable;
  listRunBtn.textContent = state.listRunning ? '실행 중...' : 'list 렌더 실행';
  document.getElementById('list-export-btn').disabled = !state.listRender;
}

function setBadge(el, ok, text) {
  el.className = `cc-badge ${ok ? 'ok' : 'bad'}`;
  el.textContent = text;
}

function renderResults() {
  renderRunError();
  // Both tabs' matrices are patched; only the active <main> is visible, so the
  // hidden tab's matrices simply sit idle off-screen (no cross-tab interference).
  renderValidateMatrix();
  renderRenderMatrix();
  renderListValidateMatrix();
  renderSearchMatrix();
  renderListRenderMatrix();
}

function renderRunError() {
  const formEl = document.getElementById('run-error');
  if (formEl) formEl.textContent = state.lastError ? `게이트웨이 오류: ${state.lastError}` : '';
  const listEl = document.getElementById('list-run-error');
  if (listEl) listEl.textContent = state.listError ? `게이트웨이 오류: ${state.listError}` : '';
}

// --- Validate matrix (4 langs) -------------------------------------------

function renderValidateMatrix() {
  renderLangMatrix(
    document.getElementById('validate-matrix'),
    state.validate,
    '검증 매트릭스 (js / php / go / rust)'
  );
}

/**
 * Generic 4-language idempotency matrix used by every validate endpoint (form
 * validate AND list-structure validate). It recomputes idempotency from the raw
 * per-language entries (computeIdempotent), paints divergent columns red, draws
 * the per-language mismatch diff, and shows each engine's valid/loadError/ms —
 * identical surface for form and list so the two tabs read symmetrically. The
 * list path carries no `data` (a list has no rows); a clean structure is
 * valid:true, a forbidden meta key surfaces as the SAME loadError envelope.
 */
function renderLangMatrix(host, v, title) {
  if (!host) return;

  if (!v) {
    host.innerHTML = sectionHead(title, idleBadge());
    return;
  }

  const results = Array.isArray(v.results) ? v.results : [];
  const { idempotent, groups } = computeIdempotent(results);

  // Determine which langs diverge from the majority signature, for red borders.
  const divergent = new Set();
  if (idempotent === false && groups) {
    const counts = {};
    for (const sig of Object.values(groups)) counts[sig] = (counts[sig] || 0) + 1;
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    for (const [lang, sig] of Object.entries(groups)) {
      if (sig !== majority) divergent.add(lang);
    }
  }

  let badge;
  if (idempotent === null) badge = naBadge('멱등 판정 불가 (실행 언어 < 2)');
  else if (idempotent) badge = okBadge('4언어 멱등 일치');
  else badge = badBadge('결과 불일치!');

  const cols = VALIDATE_LANGS.map((lang) => {
    const entry = results.find((r) => r.lang === lang);
    return validateColumn(lang, entry, divergent.has(lang));
  }).join('');

  let mismatchPanel = '';
  if (idempotent === false) {
    mismatchPanel = validateMismatchPanel(results, groups);
  }

  host.innerHTML =
    sectionHead(title, badge) +
    `<div class="cc-grid cc-grid-4">${cols}</div>` +
    mismatchPanel;
}

function validateColumn(lang, entry, divergent) {
  const color = LANG_COLOR[lang] || '#888';
  const ms = entry && typeof entry.ms === 'number' ? `${entry.ms}ms` : '';
  let inner;

  if (!entry) {
    inner = `<div class="cc-cell-idle">응답 없음</div>`;
  } else if (state.raw) {
    // raw wins over every cooked view so EVERY entry (incl. a failed CLI) is
    // exposed verbatim for the user to re-judge against the console's verdict.
    inner = `<pre class="cc-raw">${esc(JSON.stringify(entry, null, 2))}</pre>`;
  } else if (entry.ok === false) {
    inner = `<div class="cc-cell-error">CLI 실행 실패<br/><code>${esc(
      entry.error?.message || entry.error || ''
    )}</code></div>`;
  } else if (entry.loadError) {
    inner =
      `<div class="cc-badge load">LOAD-ERROR</div>` +
      `<div class="cc-loadcode">${esc(entry.loadError.code)}</div>` +
      `<div class="cc-loadmsg">${esc(entry.loadError.message)}</div>`;
  } else {
    const validBadge = entry.valid
      ? `<div class="cc-valid valid">${iconOk()} 유효함</div>`
      : `<div class="cc-valid invalid">${iconBad()} 유효하지 않음</div>`;
    const errs =
      Array.isArray(entry.errors) && entry.errors.length
        ? `<div class="cc-errs">${entry.errors
            .map(
              (e) =>
                `<div class="cc-err"><span class="cc-err-field">${esc(
                  e.field ?? e.path
                )}:</span> ${esc(e.message)} <span class="cc-err-rule">(${esc(
                  e.rule
                )})</span></div>`
            )
            .join('')}</div>`
        : '';
    inner = validBadge + errs;
  }

  return `<div class="cc-col ${divergent ? 'divergent' : ''}" style="--c:${color}">
    <div class="cc-col-head"><span>${lang}</span><span class="cc-ms">${ms}</span></div>
    <div class="cc-col-body">${inner}</div>
  </div>`;
}

function validateMismatchPanel(results, groups) {
  // Show each lang's signature so the divergent path/rule is visible.
  const rows = VALIDATE_LANGS.map((lang) => {
    const entry = results.find((r) => r.lang === lang);
    let sig;
    if (!entry) sig = '(응답 없음)';
    else if (entry.ok === false) sig = '(CLI 실패)';
    else if (entry.loadError) sig = `loadError ${entry.loadError.code}`;
    else
      sig = `valid=${Boolean(entry.valid)} errors=${JSON.stringify(
        normalizeErrors(entry.errors)
      )}`;
    return `<tr><td class="cc-diff-lang">${lang}</td><td><code>${esc(sig)}</code></td></tr>`;
  }).join('');
  return `<div class="cc-diff">
    <h4>불일치 diff — 어느 언어가 어느 path/rule 에서 갈렸는가</h4>
    <table class="cc-diff-table">${rows}</table>
  </div>`;
}

// --- Render matrix (3 frameworks) ----------------------------------------

function renderRenderMatrix() {
  renderFwMatrix(
    document.getElementById('render-matrix'),
    state.render,
    '렌더 매트릭스 (react / vue / svelte)'
  );
}

/**
 * Generic 3-framework parity matrix used by every SSR endpoint (form render,
 * list render, AND the list-tab's reused search-form render). It recomputes
 * parity from the raw entries (computeParity), paints divergent columns red,
 * draws the per-framework mismatch diff, and wires the preview/source toggle —
 * identical surface for form and list so the two tabs read symmetrically.
 */
function renderFwMatrix(host, r, title) {
  if (!host) return;

  if (!r) {
    host.innerHTML = sectionHead(title, idleBadge());
    return;
  }

  const results = Array.isArray(r.results) ? r.results : [];
  const { parity, groups } = computeParity(results);

  const divergent = new Set();
  if (parity === false && groups) {
    const counts = {};
    for (const sig of Object.values(groups)) counts[sig] = (counts[sig] || 0) + 1;
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    for (const [fw, sig] of Object.entries(groups)) {
      if (sig !== majority) divergent.add(fw);
    }
  }

  let badge;
  if (parity === null) badge = naBadge('parity 판정 불가 (렌더 성공 < 2)');
  else if (parity) badge = okBadge('3프레임워크 parity 일치');
  else badge = badBadge('렌더 불일치!');

  const cols = RENDER_FWS.map((fw) => {
    const entry = results.find((x) => x.fw === fw);
    return renderColumn(fw, entry, divergent.has(fw));
  }).join('');

  let mismatchPanel = '';
  if (parity === false) mismatchPanel = renderMismatchPanel(results);

  host.innerHTML =
    sectionHead(title, badge) +
    `<div class="cc-grid cc-grid-3">${cols}</div>` +
    mismatchPanel;

  // Attach source/preview toggles per cell after DOM insert (scoped to host).
  for (const fw of RENDER_FWS) {
    const btn = host.querySelector(`[data-toggle-src="${fw}"]`);
    if (btn) {
      btn.addEventListener('click', () => {
        const pre = host.querySelector(`[data-src="${fw}"]`);
        const frame = host.querySelector(`[data-preview="${fw}"]`);
        const showingSrc = pre.hidden === false;
        pre.hidden = showingSrc;
        if (frame) frame.hidden = !showingSrc;
        btn.textContent = showingSrc ? 'HTML 소스' : '미리보기';
      });
    }
  }
}

// --- List tab matrices ----------------------------------------------------

/**
 * List validate matrix — the 4-language CRUDUI list STRUCTURE validate fan-out
 * (/api/validate-list). The validate sister of the form tab's validate matrix,
 * drawn through the SAME renderLangMatrix: rows = js/php/go/rust, the badge is
 * the 4-language idempotency verdict, a forbidden meta key surfaces as the SAME
 * loadError cell. It sits ABOVE the search/list render matrices so the list tab
 * reads top-down as validate (4 langs) → render (3 frameworks), mirroring form.
 */
function renderListValidateMatrix() {
  renderLangMatrix(
    document.getElementById('list-validate-matrix'),
    state.listValidate,
    'list 검증 매트릭스 (js / php / go / rust)'
  );
}

/**
 * Search form matrix — the embedded `search` form-spec rendered through the
 * SAME /api/render the form tab uses. It sits ABOVE the list so the form-spec
 * reuse is visible: one spec object, the form endpoint, three frameworks in
 * parity. When the list-spec declares no `search` slot, the matrix shows an
 * idle note rather than a phantom result.
 */
function renderSearchMatrix() {
  const host = document.getElementById('search-matrix');
  if (!host) return;
  const listSpec = parseListSpec();
  const hasSearch = listSpec.ok && !!extractSearchSpec(listSpec.value);
  const title = '검색폼 매트릭스 — list-spec.search 를 /api/render(form) 로 재사용';
  if (!state.searchRender) {
    host.innerHTML = sectionHead(
      title,
      hasSearch
        ? idleBadge()
        : `<span class="cc-badge idle">이 list-spec 에는 search 슬롯이 없음</span>`
    );
    return;
  }
  renderFwMatrix(host, state.searchRender, title);
}

/** List render matrix — the 3-framework CRUDUI list SSR fan-out (/api/render-list). */
function renderListRenderMatrix() {
  renderFwMatrix(
    document.getElementById('list-render-matrix'),
    state.listRender,
    'list 렌더 매트릭스 (react / vue / svelte)'
  );
}

function renderColumn(fw, entry, divergent) {
  const color = FW_COLOR[fw] || '#888';
  const ms = entry && typeof entry.ms === 'number' ? `${entry.ms}ms` : '';
  let inner;

  if (!entry) {
    inner = `<div class="cc-cell-idle">응답 없음</div>`;
  } else if (state.raw) {
    // raw wins over every cooked view (same as the validate matrix).
    inner = `<pre class="cc-raw">${esc(JSON.stringify(entry, null, 2))}</pre>`;
  } else if (entry.ok === false && !entry.error) {
    inner = `<div class="cc-cell-error">SSR 실행 실패<br/><code>${esc(
      entry.error?.message || entry.error || ''
    )}</code></div>`;
  } else if (entry.error) {
    inner =
      `<div class="cc-badge bad">ERROR</div>` +
      `<div class="cc-loadcode">${esc(entry.error.code)}</div>` +
      `<div class="cc-loadmsg">${esc(entry.error.message)}</div>`;
  } else {
    const html = entry.html ?? '';
    inner =
      `<div class="cc-render-toolbar"><button class="cc-btn cc-btn-mini" data-toggle-src="${fw}">HTML 소스</button></div>` +
      `<iframe class="cc-preview" data-preview="${fw}" sandbox="" srcdoc="${esc(
        html
      )}"></iframe>` +
      `<pre class="cc-src" data-src="${fw}" hidden>${esc(html)}</pre>`;
  }

  return `<div class="cc-col ${divergent ? 'divergent' : ''}" style="--c:${color}">
    <div class="cc-col-head"><span>${fw}</span><span class="cc-ms">${ms}</span></div>
    <div class="cc-col-body">${inner}</div>
  </div>`;
}

function renderMismatchPanel(results) {
  const rows = RENDER_FWS.map((fw) => {
    const entry = results.find((x) => x.fw === fw);
    let sig;
    if (!entry) sig = '(응답 없음)';
    else if (entry.error) sig = `error ${entry.error.code}`;
    else sig = entry.normalized ?? '';
    return `<tr><td class="cc-diff-lang">${fw}</td><td><code>${esc(sig)}</code></td></tr>`;
  }).join('');
  return `<div class="cc-diff">
    <h4>parity diff — 어느 프레임워크가 어느 태그/속성에서 갈렸는가 (normalized 비교)</h4>
    <table class="cc-diff-table">${rows}</table>
  </div>`;
}

// --- small view helpers ---------------------------------------------------

function sectionHead(title, badgeHtml) {
  return `<div class="cc-matrix-head"><h2>${esc(title)}</h2>${badgeHtml}</div>`;
}
function idleBadge() {
  return `<span class="cc-badge idle">실행 버튼을 눌러 결과를 받으세요</span>`;
}
function okBadge(t) {
  return `<span class="cc-badge ok">${esc(t)}</span>`;
}
function badBadge(t) {
  return `<span class="cc-badge bad">${esc(t)}</span>`;
}
function naBadge(t) {
  return `<span class="cc-badge idle">${esc(t)}</span>`;
}
function iconOk() {
  return `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
}
function iconBad() {
  return `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
render();
