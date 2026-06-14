/**
 * v2 SSR renderer — field → HTML (Vue 3 SSR target).
 *
 * Flow (the four mandated stages):
 *   (1) v2 spec → (2) v2 compose (expand $ref/$patch into a single spec) →
 *   (3) resolve `design` slots + condition maps via the shared expr engine →
 *   (4) emit the SSR HTML envelope.
 *
 * The envelope is the VERIFIED Limepie/Svelte-reference structure
 * (generator-svelte/src/render.ts; reproduced byte-for-byte by the React v2
 * reference generator-react/src/v2/render.ts), reproduced byte-compatibly after
 * normalization. What changes from v1 is the SOURCE of every appearance/
 * visibility decision: v1 read scattered meta keys (class/style/group_class/
 * wrapper_class/display_switch/display_target/legacyLang); v2 reads ONLY the
 * `design` slot (per-node appearance + `show`) and the `multiple`/`lang`/`group`
 * buckets. No v1 meta key and no `eval` are used.
 *
 * Visibility (SPEC §3): `show=false` does NOT remove the field from the DOM — it
 * stamps `style="display: none"` on `.form-element-wrapper` and keeps the node
 * (the v1 legacy non-removal contract, legacyDisplay.ts:351). `show` absent =
 * always shown.
 *
 * This module produces an HTML STRING. The Vue SSR entry (ssr.ts) wraps that
 * string in a Vue 3 static vnode and emits it through @vue/server-renderer
 * renderToString — genuine Vue 3 SSR, byte-faithful to the React reference.
 */

import {
  escAttr,
  escText,
  generateUniqid,
  getValueByPath,
  joinClass,
  mergeStyle,
  parsePathString,
  styleString,
  wrapperLayerName,
} from './util';
import { resolveDesign, type ResolvedDesign } from './design';
import { makeContext } from './expr';
import { getFieldEmitter, type FieldCtx } from './fields';
import type { Translate } from './content';

/** Per-render state threaded through the recursive renderer. */
export interface RenderState {
  /** The root form data (the expr engine's formData). */
  data: Record<string, unknown>;
  /** Optional name/id prefix. */
  keyPrefix?: string;
  /** Content translator (active language). */
  t: Translate;
}

type Spec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// envelope helpers
// ---------------------------------------------------------------------------

/** form-element-wrapper open tag: class+style from design.wrapper + show. */
function openWrapper(
  design: ResolvedDesign,
  name: string
): string {
  const className = joinClass('form-element-wrapper', design.wrapper.class);
  // show=false → display:none (DOM kept). Merge design.wrapper.style after.
  const hiddenStyle = design.show ? undefined : 'display: none';
  const style = mergeStyle(hiddenStyle, design.wrapper.style);
  return (
    `<div class="${escAttr(className)}"` +
    (style ? ` style="${escAttr(style)}"` : '') +
    ` name="${escAttr(name)}">`
  );
}

/** input-group-wrapper class: base + design.wrapper.class (+ clone for rows>0). */
function inputGroupWrapperClass(design: ResolvedDesign, rowIndex = 0): string {
  return joinClass(
    'input-group-wrapper',
    rowIndex > 0 ? 'clone-element' : '',
    design.wrapper.class
  );
}

/** Label `<h6>` from content + design.label node. */
function labelTag(
  label: string | undefined,
  design: ResolvedDesign,
  omit: boolean
): string {
  if (!label || omit) return '';
  const cls = design.label.class;
  const style = styleString(design.label.style);
  return (
    `<h6 class="${escAttr(cls)}"` +
    (style ? ` style="${escAttr(style)}"` : '') +
    `>${escText(label)}</h6>`
  );
}

/** Description `<p class="description">` (content, never design). */
function descriptionTag(spec: Spec, state: RenderState): string {
  if (!spec.description) return '';
  const text = state.t(spec.description as never);
  if (!text) return '';
  return `<p class="description">${escText(text)}</p>`;
}

// ---------------------------------------------------------------------------
// multiple row buttons (from the `multiple` bucket; canonical keys only)
// ---------------------------------------------------------------------------

interface MultipleSettings {
  show: boolean;
  max?: number;
  copy?: boolean;
  sortable?: boolean;
}

/** Resolve the polymorphic `multiple` value (false|true|{settings}). */
function resolveMultiple(spec: Spec): MultipleSettings | null {
  const m = spec.multiple;
  if (m === undefined || m === false) return null;
  if (m === true) return { show: true };
  if (typeof m === 'object' && !Array.isArray(m)) {
    const o = m as Record<string, unknown>;
    return {
      show: true,
      max: typeof o.max === 'number' ? o.max : undefined,
      copy: o.copy === true,
      sortable: o.sortable === true,
    };
  }
  return null;
}

/** Row buttons HTML from canonical multiple settings (plus/minus/copy/move). */
function rowButtonsHtml(s: MultipleSettings): string {
  let html = '';
  if (s.sortable) {
    html += `<button type="button" class="btn btn-move-up"> </button>`;
    html += `<button type="button" class="btn btn-move-down"> </button>`;
  }
  const maxAttr = s.max !== undefined ? ` data-multiple-max="${escAttr(String(s.max))}"` : '';
  html += `<button type="button" class="btn btn-plus"${maxAttr}> </button>`;
  if (s.copy) html += `<button type="button" class="btn btn-copy"> </button>`;
  const minusCls = s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus';
  html += `<button type="button" class="${minusCls}"> </button>`;
  return html;
}

// ---------------------------------------------------------------------------
// lang bucket (G3 axis 2: the field VALUE is per-language)
// ---------------------------------------------------------------------------

const DEFAULT_LANGS = ['ko', 'en', 'ja', 'zh'];

interface LangSettings {
  langs: string[];
  frame: boolean;
  title?: unknown;
  groupClass?: string;
}

/** Resolve the polymorphic `lang` value (false|true|{settings}). */
function resolveLang(spec: Spec): LangSettings | null {
  const l = spec.lang;
  if (l === undefined || l === false) return null;
  if (l === true) return { langs: DEFAULT_LANGS, frame: true };
  if (typeof l === 'object' && !Array.isArray(l)) {
    const o = l as Record<string, unknown>;
    return {
      langs: Array.isArray(o.only) && o.only.length > 0 ? (o.only as string[]) : DEFAULT_LANGS,
      frame: o.frame !== false,
      title: o.title,
      groupClass: typeof o.group_class === 'string' ? o.group_class : undefined,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// data helpers
// ---------------------------------------------------------------------------

function hasData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).length > 0;
}

function rowKeys(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0) return value.map(() => generateUniqid());
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) return keys;
  }
  return [generateUniqid()];
}

// ---------------------------------------------------------------------------
// field dispatch
// ---------------------------------------------------------------------------

/** Render one already-composed field spec. */
export function renderField(
  name: string,
  spec: Spec,
  path: string,
  state: RenderState
): string {
  const fieldType = String(spec.type ?? '');
  const ctx = makeContext(parsePathString(path), state.data);
  const design = resolveDesign(spec.design, ctx);

  if (fieldType === 'group') {
    return renderGroup(name, spec, path, design, state);
  }

  const multiple = resolveMultiple(spec);
  if (multiple) {
    return renderMultipleLeaf(name, spec, path, design, multiple, state);
  }

  const lang = resolveLang(spec);
  if (lang) {
    return renderLangLeaf(name, spec, path, design, lang, state);
  }

  return renderLeaf(name, spec, path, design, state);
}

/** Render a single (non-multiple, non-lang) leaf field. */
function renderLeaf(
  name: string,
  spec: Spec,
  path: string,
  design: ResolvedDesign,
  state: RenderState
): string {
  const fieldType = String(spec.type ?? '');
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = generateUniqid();
  const label = spec.label ? state.t(spec.label as never) : undefined;

  const fieldCtx: FieldCtx = {
    spec,
    value: getValueByPath(state.data, path),
    path,
    keyPrefix: state.keyPrefix,
    design,
    t: state.t,
  };

  // checkbox / switcher special envelope (.checkbox > h6 > input-group-wrapper).
  if (fieldType === 'checkbox' || fieldType === 'switcher') {
    const inner = checkboxInner(fieldCtx);
    return (
      openWrapper(design, wrapperName) +
      `<div class="checkbox">` +
      `<h6>` +
      `<div class="${escAttr(inputGroupWrapperClass(design))}" data-uniqid="${escAttr(uniqid)}">` +
      inner +
      `</div>` +
      `</h6>` +
      descriptionTag(spec, state) +
      `</div>` +
      `</div>`
    );
  }

  const emitter = getFieldEmitter(fieldType);
  const innerHtml = emitter ? emitter(fieldCtx) : '';

  return (
    openWrapper(design, wrapperName) +
    labelTag(label, design, fieldType === 'hidden') +
    descriptionTag(spec, state) +
    `<div class="form-element">` +
    `<div class="${escAttr(inputGroupWrapperClass(design))}" data-uniqid="${escAttr(uniqid)}">` +
    innerHtml +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/** Single boolean checkbox inner markup (special envelope). */
function checkboxInner(ctx: FieldCtx): string {
  const title = ctx.spec.label ? ctx.t(ctx.spec.label as never) : '';
  const name = (() => {
    // bracket name reuse via fields emitter convention.
    return ctx.path;
  })();
  void name;
  // Minimal checkbox inner (envelope-faithful); appearance via design.main.
  const cls = joinClass('valid-target', ctx.design.main.class);
  const bracket = bracketNameFor(ctx);
  return (
    `<div><input type="checkbox" name="${escAttr(bracket)}" value="1"` +
    ` class="${escAttr(cls)}"` +
    `/> <span>${escText(title)}</span></div>`
  );
}

function bracketNameFor(ctx: FieldCtx): string {
  const segments = parsePathString(ctx.path);
  if (ctx.keyPrefix) segments.unshift(ctx.keyPrefix);
  if (segments.length === 0) return '';
  if (segments.length === 1) return segments[0]!;
  return segments[0] + segments.slice(1).map((s) => `[${s}]`).join('');
}

// ---------------------------------------------------------------------------
// multiple leaf
// ---------------------------------------------------------------------------

function renderMultipleLeaf(
  name: string,
  spec: Spec,
  path: string,
  design: ResolvedDesign,
  multiple: MultipleSettings,
  state: RenderState
): string {
  const fieldType = String(spec.type ?? '');
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const value = getValueByPath(state.data, path);
  const label = spec.label ? state.t(spec.label as never) : undefined;
  const keys = rowKeys(value);
  const buttons = rowButtonsHtml(multiple);

  let rows = '';
  keys.forEach((rowKey, rowIndex) => {
    const rowPath = `${path}.${rowKey}`;
    const rowCtx = makeContext(parsePathString(rowPath), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    const fieldCtx: FieldCtx = {
      spec,
      value: getValueByPath(state.data, rowPath),
      path: rowPath,
      keyPrefix: state.keyPrefix,
      design: rowDesign,
      t: state.t,
    };
    const emitter = getFieldEmitter(fieldType);
    const inner = (emitter ? emitter(fieldCtx) : '') + buttons;
    rows +=
      `<div class="${escAttr(inputGroupWrapperClass(rowDesign, rowIndex))}" data-uniqid="${escAttr(rowKey)}">` +
      inner +
      `</div>`;
  });

  return (
    openWrapper(design, wrapperName) +
    labelTag(label, design, fieldType === 'hidden') +
    descriptionTag(spec, state) +
    `<div class="form-element">${rows}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// lang leaf
// ---------------------------------------------------------------------------

function renderLangLeaf(
  name: string,
  spec: Spec,
  path: string,
  design: ResolvedDesign,
  lang: LangSettings,
  state: RenderState
): string {
  const fieldType = String(spec.type ?? '');
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = generateUniqid();
  const label = spec.label ? state.t(spec.label as never) : undefined;

  // Language group chrome (frame off → p-0 border-0).
  const frameClass = lang.frame ? 'lang-group' : 'lang-group p-0 border-0';
  const groupClass = joinClass(frameClass, lang.groupClass);
  const titleText = lang.title ? state.t(lang.title as never) : '';
  const titleHtml = titleText ? `<div class="lang-title">${escText(titleText)}</div>` : '';

  let childrenHtml = '';
  for (const code of lang.langs) {
    const langPath = `${path}.${code}`;
    const langCtx = makeContext(parsePathString(langPath), state.data);
    const langDesign = resolveDesign(spec.design, langCtx);
    const fieldCtx: FieldCtx = {
      spec,
      value: getValueByPath(state.data, langPath),
      path: langPath,
      keyPrefix: state.keyPrefix,
      design: langDesign,
      t: state.t,
    };
    const emitter = getFieldEmitter(fieldType);
    const inner = emitter ? emitter(fieldCtx) : '';
    // Each language child carries a lang-code prepend span.
    childrenHtml +=
      `<div class="lang-child" data-lang="${escAttr(code)}">` +
      `<span class="input-group-text lang-code">${escText(code)}</span>` +
      inner +
      `</div>`;
  }

  return (
    openWrapper(design, wrapperName) +
    labelTag(label, design, fieldType === 'hidden') +
    descriptionTag(spec, state) +
    `<div class="form-element">` +
    `<div class="${escAttr(inputGroupWrapperClass(design))}" data-uniqid="${escAttr(uniqid)}">` +
    `<div class="${escAttr(groupClass)}">${titleHtml}${childrenHtml}</div>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// group (nested properties)
// ---------------------------------------------------------------------------

function renderGroup(
  name: string,
  spec: Spec,
  path: string,
  design: ResolvedDesign,
  state: RenderState
): string {
  const multiple = resolveMultiple(spec);
  if (multiple) {
    return renderMultipleGroup(name, spec, path, design, multiple, state);
  }

  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = generateUniqid();
  const label = spec.label ? state.t(spec.label as never) : undefined;
  const groupValue = getValueByPath(state.data, path);

  // .form-group class: base + resolved design.group.class (the group node map).
  const groupClass = joinClass('form-group', design.group.class);
  const groupStyle = styleString(design.group.style);
  void hasData(groupValue);

  let fieldsHtml = '';
  const props = spec.properties as Record<string, Spec> | undefined;
  if (props) {
    for (const [fieldName, fieldSpec] of Object.entries(props)) {
      fieldsHtml += renderField(fieldName, fieldSpec, `${path}.${fieldName}`, state);
    }
  }

  return (
    openWrapper(design, wrapperName) +
    labelTag(label, design, false) +
    descriptionTag(spec, state) +
    `<div class="form-element">` +
    `<div class="${escAttr(inputGroupWrapperClass(design))}" data-uniqid="${escAttr(uniqid)}">` +
    `<div class="${escAttr(groupClass)}"${groupStyle ? ` style="${escAttr(groupStyle)}"` : ''}>${fieldsHtml}</div>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

function renderMultipleGroup(
  name: string,
  spec: Spec,
  path: string,
  design: ResolvedDesign,
  multiple: MultipleSettings,
  state: RenderState
): string {
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const label = spec.label ? state.t(spec.label as never) : undefined;
  const value = getValueByPath(state.data, path);
  const keys = rowKeys(value);
  const buttons = rowButtonsHtml(multiple);
  const props = spec.properties as Record<string, Spec> | undefined;

  let rowsHtml = '';
  keys.forEach((rowKey, rowIndex) => {
    const rowBase = `${path}.${rowKey}`;
    const rowValue =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)[rowKey]
        : undefined;
    const rowCtx = makeContext(parsePathString(rowBase), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    const groupClass = joinClass('form-group', rowDesign.group.class);

    let fieldsHtml = '';
    if (props) {
      for (const [fieldName, fieldSpec] of Object.entries(props)) {
        fieldsHtml += renderField(fieldName, fieldSpec, `${rowBase}.${fieldName}`, state);
      }
    }
    void rowValue;
    rowsHtml +=
      `<div class="${escAttr(inputGroupWrapperClass(rowDesign, rowIndex))}" data-uniqid="${escAttr(rowKey)}">` +
      `<div class="${escAttr(groupClass)}">${fieldsHtml}</div>` +
      `<span class="btn-group input-group-btn">${buttons}</span>` +
      `</div>`;
  });

  return (
    openWrapper(design, wrapperName) +
    labelTag(label, design, false) +
    descriptionTag(spec, state) +
    `<div class="form-element">${rowsHtml}</div>` +
    `</div>`
  );
}
