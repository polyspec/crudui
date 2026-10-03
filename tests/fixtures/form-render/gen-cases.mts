import { compileForm } from '@crudui/generator-core';
/**
 * Fixture generator for the form-render NEW-WIDGET cases. Runs the React CRUDUI
 * generator (the reference) over each new spec, normalizes through the SHARED
 * normalizer, and replaces matching `expected_html` cases or appends new ones. The three-framework comparison then verifies that every generator reproduces
 * the same normalized output.
 *
 * Run: npx tsx tests/fixtures/form-render/gen-cases.mts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderFields } from '../../../packages/generator-react/src/internal/renderFields';
import { normalizeHtml } from './normalize.mjs';
import { WRITTEN_CASES } from './written-cases';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(__dirname, 'cases.json');

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string; message?: string };
}

/** Wrap a single field spec in a root group (matches the fixture shape). */
function group(field: Record<string, unknown>): Record<string, unknown> {
  return { type: 'group', properties: { [Object.keys(field)[0]!]: field[Object.keys(field)[0]!] } };
}

// Declare a case with an automatically computed expected_html value.
function pass(
  name: string,
  note: string,
  spec: Record<string, unknown>,
  data?: Record<string, unknown>,
  options?: Record<string, unknown>
): FixtureCase {
  const html = renderFields(compileForm(spec, options), { ...(options ?? {}), data });
  return {
    name,
    note,
    spec,
    ...(data ? { data } : {}),
    ...(options ? { options } : {}),
    expected_html: normalizeHtml(html),
  };
}

// Declare an expected-error case without expected_html.
function err(name: string, note: string, spec: Record<string, unknown>, code: string): FixtureCase {
  return { name, note, spec, expectError: { code } };
}

const G = (props: Record<string, unknown>) => ({ type: 'group', properties: props });

const NEW: FixtureCase[] = [
  // ---- A. REGRESSION — explicit per-type minimal cases (registered emitters) --
  pass('password-bare', 'password → BARE input (no input-group), no behavior, value not default-filled.',
    G({ pw: { type: 'password', label: { ko: '비밀번호' } } }), {}, { language: 'ko' }),
  pass('password-with-data', 'password with data → value rendered (no input-group).',
    G({ pw: { type: 'password', label: { ko: '비밀번호' } } }), { pw: 'secret' }, { language: 'ko' }),
  pass('textarea-rows5', 'textarea → rows=5, input-group envelope.',
    G({ memo: { type: 'textarea', label: { ko: '메모' } } }), {}, { language: 'ko' }),
  pass('textarea-with-data', 'textarea with data → escaped text content.',
    G({ memo: { type: 'textarea', label: { ko: '메모' } } }), { memo: 'a<b>c' }, { language: 'ko' }),
  pass('integer-alias', 'integer alias → type=number input.',
    G({ qty: { type: 'integer', label: { ko: '수량' } } }), {}, { language: 'ko' }),
  pass('float-alias', 'float alias → type=number input.',
    G({ rate: { type: 'float', label: { ko: '비율' } } }), { rate: 1.5 }, { language: 'ko' }),
  pass('decimal-alias', 'decimal alias → type=number input.',
    G({ amt: { type: 'decimal', label: { ko: '금액' } } }), {}, { language: 'ko' }),
  pass('string-alias', 'string alias → type=text input.',
    G({ nm: { type: 'string', label: { ko: '이름' } } }), { nm: 'x' }, { language: 'ko' }),
  pass('dropdown-alias', 'dropdown alias → select with static items.',
    G({ sel: { type: 'dropdown', label: { ko: '선택' }, items: { a: { ko: '가' }, b: { ko: '나' } } } }),
    { sel: 'b' }, { language: 'ko' }),
  pass('hidden-no-label', 'hidden → bare input, label omitted by renderer.',
    G({ tok: { type: 'hidden', label: { ko: '토큰' }, default: 'd' } }), {}, { language: 'ko' }),
  pass('select-with-data', 'select static items + selected value.',
    G({ s: { type: 'select', label: { ko: '선택' }, items: { x: { ko: '엑스' }, y: { ko: '와이' } } } }),
    { s: 'y' }, { language: 'ko' }),
  pass('email-bare', 'email → minimal input-group leaf (data-attr trio), no value.',
    G({ em: { type: 'email', label: { ko: '이메일' } } }), {}, { language: 'ko' }),
  pass('email-with-data', 'email with value → value rendered verbatim.',
    G({ em: { type: 'email', label: { ko: '이메일' } } }), { em: 'a@b.com' }, { language: 'ko' }),
  pass('checkbox-bare', 'checkbox → input with its own caption label in the node body, value=1, no value.',
    G({ agree: { type: 'checkbox', label: { ko: '동의' } } }), {}, { language: 'ko' }),
  pass('checkbox-with-data', 'checkbox with value 1 renders checked.',
    G({ agree: { type: 'checkbox', label: { ko: '동의' } } }), { agree: 1 }, { language: 'ko' }),
  pass('switcher-bare', 'switcher → a checkbox input with role=switch and the switch class, its caption in the node body, no value.',
    G({ on: { type: 'switcher', label: { ko: '켜기' } } }), {}, { language: 'ko' }),

  // ---- B. NEW WIDGETS — empty + with-data (high-freq first) ------------------
  pass('choice-empty', 'choice/radio btn-group, no value → no checked, data-attr trio per input.',
    G({ c: { type: 'choice', label: { ko: '선택' }, items: { a: { ko: '가' }, b: { ko: '나' } } } }),
    {}, { language: 'ko' }),
  pass('choice-with-data', 'choice with value → checked on matching radio; data-is-default on default.',
    G({ c: { type: 'choice', label: { ko: '선택' }, default: 'a', items: { a: { ko: '가' }, b: { ko: '나' } } } }),
    { c: 'b' }, { language: 'ko' }),
  pass('radio-alias', 'radio alias → choice markup.',
    G({ r: { type: 'radio', label: { ko: '라디오' }, items: { y: { ko: '예' }, n: { ko: '아니오' } } } }),
    { r: 'y' }, { language: 'ko' }),
  pass('multichoice-empty', 'multichoice/checkboxes btn-group, no value.',
    G({ m: { type: 'multichoice', label: { ko: '복수' }, items: { a: { ko: '가' }, b: { ko: '나' } } } }),
    {}, { language: 'ko' }),
  pass('multichoice-with-data', 'multichoice with array value → checked on selected.',
    G({ m: { type: 'multichoice', label: { ko: '복수' }, items: { a: { ko: '가' }, b: { ko: '나' }, c: { ko: '다' } } } }),
    { m: ['a', 'c'] }, { language: 'ko' }),
  pass('checkboxes-alias', 'checkboxes alias → multichoice markup.',
    G({ cb: { type: 'checkboxes', label: { ko: '체크' }, items: { x: { ko: '엑스' } } } }),
    { cb: ['x'] }, { language: 'ko' }),
  pass('dummy-empty', 'dummy display div, no value → empty.',
    G({ d: { type: 'dummy', label: { ko: '더미' } } }), {}, { language: 'ko' }),
  pass('dummy-with-data', 'dummy with value → div text (nl2br applied).',
    G({ d: { type: 'dummy', label: { ko: '더미' } } }), { d: 'hello' }, { language: 'ko' }),
  pass('dummy-items-lookup', 'dummy with items map → value looked up to label.',
    G({ d: { type: 'dummy', label: { ko: '더미' }, items: { a: '가', b: '나' } } }), { d: 'b' }, { language: 'ko' }),
  pass('html-alias', 'html alias → dummy markup.',
    G({ h: { type: 'html', label: { ko: 'HTML' } } }), { h: 'raw' }, { language: 'ko' }),
  pass('static-alias', 'static alias → dummy markup.',
    G({ st: { type: 'static', label: { ko: '정적' } } }), { st: 'txt' }, { language: 'ko' }),
  pass('dummy-input-empty', 'dummy-input always-readonly, form-control base (no rule trio).',
    G({ di: { type: 'dummy-input', label: { ko: '읽기' } } }), {}, { language: 'ko' }),
  pass('dummy-input-with-data', 'dummy-input with value, readonly.',
    G({ di: { type: 'dummy-input', label: { ko: '읽기' } } }), { di: 'ro' }, { language: 'ko' }),
  pass('date-empty', 'date input-group, no value.',
    G({ dt: { type: 'date', label: { ko: '날짜' } } }), {}, { language: 'ko' }),
  pass('date-with-data', 'date with YYYY-MM-DD value passthrough.',
    G({ dt: { type: 'date', label: { ko: '날짜' } } }), { dt: '2026-06-14' }, { language: 'ko' }),
  pass('datetime-empty', 'datetime-local BARE input (no input-group), no value.',
    G({ dtm: { type: 'datetime', label: { ko: '일시' } } }), {}, { language: 'ko' }),
  pass('datetime-with-data', 'datetime-local with value normalized to :00 seconds.',
    G({ dtm: { type: 'datetime', label: { ko: '일시' } } }), { dtm: '2026-06-14T10:30' }, { language: 'ko' }),
  pass('datetime-local-alias', 'datetime-local alias → datetime markup.',
    G({ dl: { type: 'datetime-local', label: { ko: '일시' } } }), { dl: '2026-06-14T10:30:45' }, { language: 'ko' }),
  pass('image-empty', 'image two-input file widget, empty-data branch.',
    G({ img: { type: 'image', label: { ko: '이미지' } } }), {}, { language: 'ko' }),
  pass('image-options', 'image with options size constraints + accept → data-* attrs.',
    G({ img: { type: 'image', label: { ko: '이미지' },
      options: { max_width: 800, min_width: 100, preview_max_width: 200 } } }), {}, { language: 'ko' }),
  pass('button-empty', 'button → a button element with the content text, no script and no hidden input.',
    G({ b: { type: 'button', label: { ko: '버튼' }, content: { ko: '실행' } } }), {}, { language: 'ko' }),
  pass('action-alias', 'action alias → the button element with the onclick behavior attribute.',
    G({ a: { type: 'action', label: { ko: '액션' }, content: { ko: '저장' }, behavior: { onclick: 'doSave()' } } }),
    {}, { language: 'ko' }),
  pass('search-empty', 'search/autocomplete select2 host, no items → placeholder option.',
    G({ sc: { type: 'search', label: { ko: '검색' } } }), {}, { language: 'ko' }),
  pass('search-static-items', 'search with static items → options built.',
    G({ sc: { type: 'search', label: { ko: '검색' }, items: { a: { ko: '가' }, b: { ko: '나' } } } }),
    { sc: 'a' }, { language: 'ko' }),
  pass('autocomplete-alias', 'autocomplete alias → search markup.',
    G({ ac: { type: 'autocomplete', label: { ko: '자동' } } }), {}, { language: 'ko' }),
  pass('tinymce-empty', 'tinymce textarea + init script, defaults rows=3 height=300.',
    G({ tm: { type: 'tinymce', label: { ko: '에디터' } } }), {}, { language: 'ko' }),
  pass('tinymce-options', 'tinymce with options height/rows/fileserver.',
    G({ tm: { type: 'tinymce', label: { ko: '에디터' }, options: { height: 500, rows: 10, fileserver: 'cdn' } } }),
    { tm: '<p>x</p>' }, { language: 'ko' }),
  pass('wysiwyg-alias', 'wysiwyg alias → tinymce markup.',
    G({ wy: { type: 'wysiwyg', label: { ko: '위지윅' } } }), {}, { language: 'ko' }),

  // freq-0 family reps
  pass('file-empty', 'file widget empty-data branch (image family).',
    G({ f: { type: 'file', label: { ko: '파일' } } }), {}, { language: 'ko' }),
  pass('cover-empty', 'cover empty-data branch (single file input).',
    G({ cv: { type: 'cover', label: { ko: '커버' } } }), {}, { language: 'ko' }),
  pass('cover-simple-alias', 'cover-simple alias → cover markup.',
    G({ cs: { type: 'cover-simple', label: { ko: '커버심플' } } }), {}, { language: 'ko' }),
  pass('image-viewer-empty', 'image-viewer no value → Korean empty literal kept verbatim.',
    G({ iv: { type: 'image-viewer', label: { ko: '뷰어' } } }), {}, { language: 'ko' }),
  pass('image-viewer-with-data', 'image-viewer array value → img per row + options.height.',
    G({ iv: { type: 'image-viewer', label: { ko: '뷰어' }, options: { height: 120 } } }),
    { iv: ['/a.png', '/b.png'] }, { language: 'ko' }),
  pass('selectbox-alias', 'selectbox → select variant (reuses select emitter).',
    G({ sb: { type: 'selectbox', label: { ko: '셀렉트박스' }, items: { a: { ko: '가' } } } }),
    { sb: 'a' }, { language: 'ko' }),
  pass('checkcontainer-alias', 'checkcontainer → multichoice variant.',
    G({ cc: { type: 'checkcontainer', label: { ko: '컨테이너' }, items: { a: { ko: '가' } } } }),
    { cc: ['a'] }, { language: 'ko' }),
  pass('summernote-empty', 'summernote textarea + init script, rows=5.',
    G({ sn: { type: 'summernote', label: { ko: '서머노트' } } }), {}, { language: 'ko' }),
  pass('editorjs-empty', 'editorjs host textarea + init script.',
    G({ ej: { type: 'editorjs', label: { ko: '에디터JS' } } }), {}, { language: 'ko' }),
  pass('tui-empty', 'tui host textarea + init script.',
    G({ tu: { type: 'tui', label: { ko: 'TUI' } } }), {}, { language: 'ko' }),
  pass('tagify-empty', 'tagify text host + init script.',
    G({ tg: { type: 'tagify', label: { ko: '태그' } } }), {}, { language: 'ko' }),
  pass('tagify2-server', 'tagify2 with options.server (ajax variant).',
    G({ tg2: { type: 'tagify2', label: { ko: '태그2' }, options: { server: '/api/tags', max_tags: 5 } } }),
    {}, { language: 'ko' }),

  // ---- C. DESIGN-SLOT coverage per widget ------------------------------------
  pass('choice-design-label-class', 'design.main.class → choice per-item LABEL class.',
    G({ c: { type: 'choice', label: { ko: '선택' }, items: { a: { ko: '가' } },
      design: { class: 'btn-lg' } } }), { c: 'a' }, { language: 'ko' }),
  pass('tinymce-design-class', 'design.main.class → tinymce textarea class.',
    G({ tm: { type: 'tinymce', label: { ko: '에디터' }, design: { class: 'tall' } } }), {}, { language: 'ko' }),
  pass('image-design-class', 'design.main.class → image file-input class.',
    G({ img: { type: 'image', label: { ko: '이미지' }, design: { class: 'big-file' } } }), {}, { language: 'ko' }),
  pass('date-design-prepend', 'date design.prepend.class + prepend content.',
    G({ dt: { type: 'date', label: { ko: '날짜' }, prepend: { ko: '📅' }, design: { prepend: { class: 'pre' } } } }),
    {}, { language: 'ko' }),
  pass('choice-design-show-false', 'design.show:false → node hidden attribute; choice inner present.',
    G({ c: { type: 'choice', label: { ko: '선택' }, items: { a: { ko: '가' } }, design: { show: false } } }),
    {}, { language: 'ko' }),

  // ---- D. DYNAMIC ITEMS STUB -------------------------------------------------
  pass('select-dynamic-stub', 'select dynamic items {model} → placeholder option + data-source-*, NO fabricated options.',
    G({ s: { type: 'select', label: { ko: '선택' },
      items: { model: 'User', method: 'getList', table: 'users', relations: ['role'] } } }), {}, { language: 'ko' }),
  pass('choice-dynamic-stub', 'choice dynamic items {model} → empty btn-group + dynamic-items comment.',
    G({ c: { type: 'choice', label: { ko: '선택' },
      items: { model: 'Cat', table: 'cats' } } }), {}, { language: 'ko' }),
  pass('multichoice-dynamic-stub', 'multichoice dynamic items {model} → empty btn-group + comment.',
    G({ m: { type: 'multichoice', label: { ko: '복수' },
      items: { model: 'Tag', table: 'tags' } } }), {}, { language: 'ko' }),
  pass('search-dynamic-stub', 'search dynamic items {model} → keeps placeholder option + data-source-*.',
    G({ sc: { type: 'search', label: { ko: '검색' },
      items: { model: 'Doc', method: 'find', table: 'docs', relations: [] } } }), {}, { language: 'ko' }),

  // ---- E. FALLBACK SURFACING -------------------------------------------------
  err('unsupported-type-throws', 'unregistered type under default throw → UnsupportedFieldTypeError.',
    G({ x: { type: 'totally-unknown-widget', label: { ko: '미지원' } } }), 'UNSUPPORTED_FIELD_TYPE'),
  pass('unsupported-type-marker', 'options.unsupported:marker → data-unsupported-type div + HTML comment.',
    G({ x: { type: 'totally-unknown-widget', label: { ko: '미지원' } } }), {}, { unsupported: 'marker', language: 'ko' }),

  // ---- F. BEHAVIOR PASSTHROUGH per widget ------------------------------------
  pass('choice-behavior-passthrough', 'choice behavior onchange/onclick → verbatim attrs on each input (no minify, no eval).',
    G({ c: { type: 'choice', label: { ko: '선택' }, items: { a: { ko: '가' }, b: { ko: '나' } },
      behavior: { onchange: 'onCh(this)', onclick: 'onCl(this)' } } }), { c: 'a' }, { language: 'ko' }),
  pass('datetime-behavior-passthrough', 'datetime behavior onchange → verbatim onchange attr.',
    G({ dtm: { type: 'datetime', label: { ko: '일시' }, behavior: { onchange: 'dtChange()' } } }),
    {}, { language: 'ko' }),
  pass('button-behavior-onclick', 'button behavior onclick → an onclick attribute on the button element, verbatim.',
    G({ b: { type: 'button', label: { ko: '버튼' }, content: { ko: '실행' },
      behavior: { onclick: 'window.run() && go()' } } }), {}, { language: 'ko' }),

  // ---- G. DECLARED ATTRIBUTES (docs/spec/form-markup.md, Declared attributes) --
  pass('control-attributes-text', 'design.attributes on a text input after its crudui attributes and design.wrapper.attributes on the node root after its class and path.',
    G({ theme: { type: 'text', label: 'Theme', design: { class: 'wide', style: 'color: red',
      attributes: { 'data-setting': 'theme', 'aria-describedby': 'theme-help' },
      wrapper: { class: 'row', style: 'margin: 0', attributes: { 'data-section': 'look', 'aria-label': 'Look & feel' } } } } }),
    { theme: 'dark' }, { language: 'en' }),
  pass('control-attributes-hidden-node', 'design.wrapper.attributes follow the hidden attribute of a node that design.show hides.',
    G({ theme: { type: 'text', label: 'Theme', design: { show: false, wrapper: { attributes: { 'data-section': 'look' } } } } }),
    {}, { language: 'en' }),
  pass('control-attributes-behavior', 'design.attributes on a text input with a behavior attribute follow the behavior and id attributes.',
    G({ theme: { type: 'text', label: 'Theme', behavior: { onchange: 'save(this)' }, design: { attributes: { 'data-setting': 'theme' } } } }),
    { theme: 'dark' }, { language: 'en' }),
  pass('control-attributes-select-textarea', 'design.attributes on a select and a textarea, each before its style.',
    G({ size: { type: 'select', label: 'Size', items: { s: 'Small', l: 'Large' }, design: { style: 'width: 5em', attributes: { 'data-setting': 'size' } } },
      memo: { type: 'textarea', label: 'Memo', design: { attributes: { 'aria-describedby': 'memo-help' } } } }),
    { size: 'l', memo: 'x' }, { language: 'en' }),
  pass('control-attributes-checkbox', 'design.attributes on a checkbox input and a switcher input before name, checked and value.',
    G({ dark: { type: 'checkbox', label: 'Dark', design: { attributes: { 'data-setting': 'dark' }, wrapper: { attributes: { 'data-section': 'look' } } } },
      sync: { type: 'switcher', label: 'Sync', design: { attributes: { 'aria-describedby': 'sync-help' } } } }),
    { dark: true }, { language: 'en' }),
  pass('control-attributes-choices', 'design.attributes on every option input of a choice and a multichoice field, after their crudui attributes.',
    G({ mode: { type: 'choice', label: 'Mode', items: { a: 'Auto', m: 'Manual' }, design: { attributes: { 'data-setting': 'mode' } } },
      days: { type: 'multichoice', label: 'Days', items: { mo: 'Mon', tu: 'Tue' }, design: { attributes: { 'data-setting': 'days', 'aria-describedby': 'days-help' } } } }),
    { mode: 'm', days: ['tu'] }, { language: 'en' }),
  pass('control-attributes-choice-behavior', 'design.attributes on option inputs with behavior attributes follow data-is-default and checked.',
    G({ mode: { type: 'choice', label: 'Mode', items: { a: 'Auto', m: 'Manual' }, behavior: { onchange: 'save(this)' }, design: { attributes: { 'data-setting': 'mode' } } },
      days: { type: 'multichoice', label: 'Days', items: { mo: 'Mon' }, behavior: { onchange: 'save(this)' }, design: { attributes: { 'data-setting': 'days' } } } }),
    { mode: 'a', days: ['mo'] }, { language: 'en' }),
  pass('control-attributes-dynamic-choice', 'A dynamic choice source renders no option input and no control attributes; the node root keeps its wrapper attributes.',
    G({ mode: { type: 'choice', label: 'Mode', items: { model: 'Mode', table: 'modes' }, design: { attributes: { 'data-setting': 'mode' }, wrapper: { attributes: { 'data-section': 'look' } } } } }),
    {}, { language: 'en' }),
  pass('control-attributes-file-display-button', 'design.attributes on the file input of an image field, the div of a dummy field, the button of an action field and the select of a search field.',
    G({ photo: { type: 'image', label: 'Photo', design: { attributes: { 'data-setting': 'photo' } } },
      shown: { type: 'dummy', label: 'Shown', design: { class: 'note', style: 'color: gray', attributes: { 'aria-live': 'polite' } } },
      run: { type: 'button', label: 'Run', content: 'Run', design: { attributes: { 'data-setting': 'run' } } },
      pick: { type: 'search', label: 'Pick', items: { a: 'A' }, design: { attributes: { 'data-setting': 'pick' } } } }),
    { shown: 'Ready' }, { language: 'en' }),
  pass('control-attributes-rows-lang-group', 'design.attributes on every row control of a repeated scalar field and every language control; wrapper attributes on the collection, lang and group roots and none on row or lang-item nodes.',
    G({ tags: { type: 'text', label: 'Tags', multiple: true, design: { attributes: { 'data-setting': 'tags' }, wrapper: { attributes: { 'data-section': 'tags' } } } },
      title: { type: 'text', label: 'Title', lang: { only: ['en', 'ko'] }, design: { attributes: { 'data-setting': 'title' }, wrapper: { attributes: { 'data-section': 'title' } } } },
      look: { type: 'group', label: 'Look', design: { wrapper: { attributes: { 'aria-label': 'Look' } } }, properties: { size: { type: 'number', label: 'Size' } } } }),
    { tags: { __opt_a1__: 'x', __opt_b2__: 'y' }, title: { en: 'Hi', ko: '안녕' } }, { language: 'en' }),

  // ---- H. RANGE FIELDS (docs/spec/form-markup.md, Range fields) ----------------
  pass('range-default-unit', 'range → a range input with min, max and step from validate.range and validate.step, an output with the default value and the append affix as the unit.',
    G({ volume: { type: 'range', label: 'Volume', default: 50, append: '%', validate: { range: [0, 100], step: 5 } } }),
    {}, { language: 'en' }),
  pass('range-bound-fraction', 'range with fractional bounds and step, a prepend affix and a bound value written in the input and the output.',
    G({ balance: { type: 'range', label: 'Balance', prepend: 'L', validate: { range: [-1.5, 1.5], step: 0.25 } } }),
    { balance: -0.75 }, { language: 'en' }),
  pass('range-empty', 'range without a default or data → an empty value and an empty output.',
    G({ level: { type: 'range', label: 'Level', validate: { required: true, range: [2, 10], step: 2 } } }),
    {}, { language: 'en' }),
  pass('range-behavior-design', 'range with a behavior attribute, design.class, design.style and declared attributes → the raw input and the output.',
    G({ volume: { type: 'range', label: 'Volume', default: 50, append: 'dB', validate: { range: [0, 100], step: 10 },
      behavior: { onchange: 'save(this)' }, design: { class: 'wide', style: 'width: 8rem', attributes: { 'data-setting': 'volume' } } },
      gain: { type: 'range', validate: { range: [0, 1], step: 0.1 }, design: { style: 'width: 4rem', attributes: { 'aria-label': 'Gain' } } } }),
    { gain: '0.3' }, { language: 'en' }),

  // ---- I. CHOICE APPEARANCE (docs/spec/form-markup.md, Choice appearance) ------
  pass('choice-appearance-swatches', 'choice items with class, style and attributes → the label class after the label classes, the label style, the input attributes after the control attributes; design.group on the choices element.',
    G({ accent: { type: 'choice', label: 'Accent', design: { class: 'large', attributes: { 'data-setting': 'accent' }, group: { class: 'swatches', style: 'display: grid; gap: 4px' } },
      items: [
        { value: 'blue', label: 'Blue', class: 'swatch', style: '--swatch-bg: #1d4ed8', attributes: { 'aria-label': 'Blue accent' } },
        { value: 'green', label: 'Green', class: ' swatch  swatch--dark ', style: '--swatch-bg: #15803d; outline: 1px solid red' },
        { value: 'plain', label: 'Plain' },
      ] } }),
    { accent: 'green' }, { language: 'en' }),
  pass('choice-appearance-multichoice-override', 'multichoice items: a choice attribute named like a control attribute keeps its position and takes the choice value; the choices style without a class.',
    G({ days: { type: 'multichoice', label: 'Days', design: { attributes: { 'data-setting': 'days', 'aria-describedby': 'days-help' }, group: { style: 'display: flex' } },
      items: [
        { value: 'mo', label: 'Mon', attributes: { 'aria-describedby': 'mo-help', 'data-day': '1' } },
        { value: 'tu', label: 'Tue', style: 'font-weight: bold' },
      ] } }),
    { days: ['tu'] }, { language: 'en' }),
  pass('choice-appearance-behavior', 'choice items with appearance and a behavior attribute → the raw inputs with the choice attributes and the raw label style.',
    G({ accent: { type: 'radio', label: 'Accent', behavior: { onchange: 'go(this)' }, design: { attributes: { 'data-setting': 'accent' } },
      items: [
        { value: 'blue', label: 'Blue', class: 'swatch', style: '--swatch-bg: #1d4ed8', attributes: { 'aria-label': 'Blue accent', 'data-setting': 'blue' } },
        { value: 'red', label: 'Red', class: 'swatch' },
      ] } }),
    { accent: 'blue' }, { language: 'en' }),

  // ---- J. LAYOUT (docs/spec/form-markup.md, Layout) ----------------------------
  pass('inline-layout-fields', 'an inline group → crudui-node--inline on every field node before the wrapper class; a checkbox and a switcher with a label write the label and the description in the header and the input alone in the body; a checkbox without a label keeps its caption; buttons with and without a label.',
    G({ look: { type: 'group', label: 'Look', design: { layout: 'inline', wrapper: { class: 'section' } }, properties: {
      theme: { type: 'select', label: 'Theme', description: 'Applies to every window.', items: { light: 'Light', dark: 'Dark' }, design: { wrapper: { class: 'wide' } } },
      sync: { type: 'switcher', label: 'Sync', description: 'Keeps every window in step.' },
      agree: { type: 'checkbox', label: 'Agree', design: { attributes: { 'data-setting': 'agree' } } },
      bare: { type: 'checkbox' },
      run: { type: 'button', label: 'Sync now', content: 'Run' },
      go: { type: 'button', content: 'Go' },
      note: { type: 'text' },
    } },
    outside: { type: 'checkbox', label: 'Outside' } }),
    { look: { sync: true, agree: 1 } }, { language: 'en' }),
  pass('inline-layout-line-stacked', 'a line group in an inline group → crudui-node--inline crudui-node--line and plain child fields; a nested group inherits inline; a stacked group ends it; a lang field in an inline group; a line group outside an inline layout.',
    G({ look: { type: 'group', label: 'Look', design: { layout: 'inline' }, properties: {
      font: { type: 'group', label: 'Font', design: { layout: 'line' }, properties: { family: { type: 'text', label: 'Family' }, size: { type: 'number', label: 'Size', design: { wrapper: { style: 'flex: 1' } } } } },
      nested: { type: 'group', properties: { deep: { type: 'checkbox', label: 'Deep' } } },
      plain: { type: 'group', design: { layout: 'stacked' }, properties: { flat: { type: 'switcher', label: 'Flat' } } },
      names: { type: 'text', label: 'Names', lang: { only: ['en', 'ko'] } },
    } },
    actions: { type: 'group', design: { layout: 'line' }, properties: { a: { type: 'text', label: 'A' }, b: { type: 'text', label: 'B' } } } }),
    { look: { font: { family: 'Mono', size: 12 }, names: { en: 'Hi', ko: '안녕' } } }, { language: 'en' }),
  pass('inline-layout-repeated', 'an inline repeated group → the fields of its rows have crudui-node--inline; the collection and row nodes do not.',
    G({ rows: { type: 'group', label: 'Rows', multiple: true, design: { layout: 'inline' }, properties: { name: { type: 'text', label: 'Name' }, on: { type: 'switcher', label: 'On' } } } }),
    { rows: { __opt_a1__: { name: 'x', on: '1' } } }, { language: 'en' }),
];

// Cases whose expected HTML is written from the specification, not rendered.
NEW.push(...WRITTEN_CASES);

void group; // (kept for ad-hoc use)

const existing = JSON.parse(readFileSync(casesPath, 'utf8')) as FixtureCase[];
const existingNames = new Set(existing.map((c) => c.name));
const additions = NEW.filter((c) => !existingNames.has(c.name));
const replacements = new Map(NEW.map(c => [c.name, c]));
const merged = [...existing.map(c => replacements.get(c.name) ?? c), ...additions];

writeFileSync(casesPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
process.stdout.write(`existing=${existing.length} new=${additions.length} total=${merged.length}\n`);
