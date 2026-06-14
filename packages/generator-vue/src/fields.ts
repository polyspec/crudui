/**
 * CRUDUI type-specific inner emitters — the `.input-group` inner markup per field
 * type. Structure (envelope, input-group, data-attr trio) is the verified
 * Limepie envelope (fieldHtml.ts REGISTRY); APPEARANCE is taken from the
 * resolved `design` node map (main node class/style, prepend node), and CONTENT
 * (placeholder/prepend/append/content) from `t()` over LocalizedText. NO legacy meta
 * key (element_class/button_class/prepend_class/style/onchange) is read here.
 *
 * The main-node class base is always `valid-target form-control`
 * (`valid-target form-select` for select); the resolved `design.class` is
 * appended (the legacy element_class slot). The data-attr trio
 * (data-name/data-rule-name/data-default) is the limepie validation contract.
 *
 * CRUDUI SLOT MAPPING (single truth):
 *  - APPEARANCE  → design.main.class / design.main.style (+ per-node design.*)
 *  - VISIBILITY  → design.show (handled by the wrapper in render.ts)
 *  - BEHAVIOR    → behavior.{onchange,onclick,...} OPAQUE passthrough (no minify,
 *                  no expr eval, no legacy event→onchange transform).
 *  - CONTENT     → spec.content / spec.text / spec.placeholder via t().
 *  - OPTIONS     → spec.options.* (type-dependent chrome settings) emitted as
 *                  data-* attrs; never expr-evaluated.
 *  - ITEMS       → static array | value-label map → built options; dynamic
 *                  {model,...} source → STUB (no fabricated options).
 *
 * Output is an HTML STRING (the verified envelope, byte-identical to the React
 * reference). The Vue SSR entry (ssr.ts) emits this string through Vue 3's
 * createStaticVNode + renderToString — genuine Vue 3 SSR, byte-faithful output.
 */

import {
  applyDefaultString,
  cleanStr,
  elementId,
  escAttr,
  escText,
  joinClass,
  leafName,
  phpString,
  phpTruthy,
  ruleNameForPath,
  styleString,
  toBracketNotationWithPrefix,
} from './util';
import type { ResolvedDesign } from './design';
import type { Translate } from './content';

/** Inputs every type emitter needs for one leaf field. */
export interface FieldCtx {
  /** The composed (single-spec) field node. */
  spec: Record<string, unknown>;
  /** The field's current value. */
  value: unknown;
  /** Dot path within the form. */
  path: string;
  /** Optional name/id prefix. */
  keyPrefix?: string;
  /** Resolved design appearance for this field. */
  design: ResolvedDesign;
  /** Content translator (active language). */
  t: Translate;
}

type Emitter = (ctx: FieldCtx) => string;

function bracketName(ctx: FieldCtx): string {
  return toBracketNotationWithPrefix(ctx.path, ctx.keyPrefix);
}

/** The limepie data-attr trio for the main node. */
function dataAttrs(ctx: FieldCtx): string {
  return (
    ` data-name="${escAttr(leafName(ctx.path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    ` data-default="${escAttr(phpString(ctx.spec.default))}"`
  );
}

/** Main-node class: base + resolved design.class (design.class is the element slot). */
function mainClass(ctx: FieldCtx, base: string): string {
  return joinClass(base, ctx.design.main.class);
}

/** Main-node style attribute (resolved design.style), or ''. */
function mainStyleAttr(ctx: FieldCtx): string {
  const s = styleString(ctx.design.main.style);
  return s ? ` style="${escAttr(s)}"` : '';
}

/** Prepend span: content from LocalizedText prepend, class from design.prepend. */
function prependSpan(ctx: FieldCtx): string {
  const content = ctx.spec.prepend;
  if (content === undefined || content === null || content === '') return '';
  const text = ctx.t(content as never);
  if (!text) return '';
  const cls = joinClass('input-group-text', ctx.design.prepend.class);
  const style = styleString(ctx.design.prepend.style);
  return `<span class="${escAttr(cls)}"${style ? ` style="${escAttr(style)}"` : ''}>${escText(text)}</span>`;
}

/** Append span: content from LocalizedText append (no dedicated design node). */
function appendSpan(ctx: FieldCtx): string {
  const content = ctx.spec.append;
  if (content === undefined || content === null || content === '') return '';
  const text = ctx.t(content as never);
  if (!text) return '';
  return `<span class="input-group-text">${escText(text)}</span>`;
}

function placeholderAttr(ctx: FieldCtx): string {
  const p = ctx.spec.placeholder;
  if (p === undefined || p === null || p === '') return '';
  const text = ctx.t(p as never);
  return text ? ` placeholder="${escAttr(text)}"` : '';
}

/**
 * Behavior slot → opaque on-event attributes. The scripts pass through VERBATIM
 * (SPEC §4): the behavior slot is never routed through the expression engine —
 * only `design.show`/`design.class`/`design.style` are. `behavior: false`
 * nullifies the slot (no attributes). A behavior entry is a string or
 * `{ script }`. NO minify, NO legacy event→onchange transform.
 */
function behaviorAttrs(ctx: FieldCtx): string {
  const b = ctx.spec.behavior;
  if (b === undefined || b === false || b === true || typeof b !== 'object') return '';
  let out = '';
  for (const [action, entry] of Object.entries(b as Record<string, unknown>)) {
    let script: string | undefined;
    if (typeof entry === 'string') script = entry;
    else if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).script === 'string') {
      script = (entry as Record<string, unknown>).script as string;
    }
    if (script) out += ` ${action}="${escAttr(script)}"`;
  }
  return out;
}

/** A single behavior script for one action (or '') — for emitters that need it inline. */
function behaviorScript(ctx: FieldCtx, action: string): string {
  const b = ctx.spec.behavior;
  if (b === undefined || b === false || b === true || typeof b !== 'object') return '';
  const entry = (b as Record<string, unknown>)[action];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).script === 'string') {
    return (entry as Record<string, unknown>).script as string;
  }
  return '';
}

// ---------------------------------------------------------------------------
// options slot — type-dependent chrome settings (SPEC §3 §3-종속격리)
// ---------------------------------------------------------------------------

/** Read one options.* value as a string, or undefined when absent. */
function optStr(ctx: FieldCtx, key: string, fallback?: string): string | undefined {
  const o = ctx.spec.options;
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const v = (o as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return phpString(v);
  }
  return fallback;
}

/** A required options.* value with a default (always a string). */
function optWith(ctx: FieldCtx, key: string, fallback: string): string {
  return optStr(ctx, key, fallback) ?? fallback;
}

// ---------------------------------------------------------------------------
// items source classification (static vs dynamic {model})
// ---------------------------------------------------------------------------

/**
 * A DYNAMIC items source is a `{ model, ... }` descriptor (DB-backed). The legacy
 * gate is exactly `'model' in items` (fieldHtml.ts:375/454, select.ts:237). A
 * dynamic source has NO options at SSR time — emitting its descriptor keys as
 * option value/label would FABRICATE data. The static generator has no DB, so it
 * MUST stub (placeholder + data-source-*) and let the client/PHP pass hydrate.
 */
function isDynamicItemsSource(items: unknown): items is Record<string, unknown> {
  return (
    items !== null &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    'model' in (items as Record<string, unknown>)
  );
}

/** Static items → [key,label] entries. Dynamic source → [] (never enumerate). */
function itemEntries(items: unknown): Array<[string, unknown]> {
  if (items === null || items === undefined) return [];
  if (Array.isArray(items)) return items.map((v, i) => [String(i), v]);
  if (typeof items === 'object') {
    if (isDynamicItemsSource(items)) return [];
    return Object.entries(items as Record<string, unknown>);
  }
  return [];
}

/** data-source-* attrs for a dynamic items stub (opaque descriptor passthrough). */
function dynamicSourceAttrs(items: Record<string, unknown>): string {
  const model = phpString(items.model);
  const method = items.method !== undefined ? phpString(items.method) : '';
  const table = items.table !== undefined ? phpString(items.table) : '';
  const relations = 'relations' in items ? JSON.stringify(items.relations ?? []) : '[]';
  return (
    ` data-source-model="${escAttr(model)}"` +
    ` data-source-method="${escAttr(method)}"` +
    ` data-source-table="${escAttr(table)}"` +
    ` data-source-relations="${escAttr(relations)}"`
  );
}

// ---------------------------------------------------------------------------
// text family (text/string/email/number)
// ---------------------------------------------------------------------------

function textLike(inputType: string): Emitter {
  return (ctx) => {
    const name = bracketName(ctx);
    const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
    const input =
      `<input type="${inputType}" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
      ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
      placeholderAttr(ctx) +
      mainStyleAttr(ctx) +
      behaviorAttrs(ctx) +
      dataAttrs(ctx) +
      ' />';
    return `<div class="input-group">${prependSpan(ctx)}${input}${appendSpan(ctx)}</div>`;
  };
}

const text = textLike('text');
const email = textLike('email');
const number = textLike('number');

// ---------------------------------------------------------------------------
// password — BARE input (no input-group wrapper)
// ---------------------------------------------------------------------------

const password: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const value = phpString(ctx.value);
  return (
    `<input type="password" name="${escAttr(name)}" value="${escAttr(value)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    mainStyleAttr(ctx) +
    dataAttrs(ctx) +
    ' />'
  );
};

// ---------------------------------------------------------------------------
// textarea
// ---------------------------------------------------------------------------

const textarea: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const ta =
    `<textarea name="${escAttr(name)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    ` rows="5"` +
    mainStyleAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${escText(displayValue)}</textarea>`;
  return `<div class="input-group">${prependSpan(ctx)}${ta}${appendSpan(ctx)}</div>`;
};

// ---------------------------------------------------------------------------
// select — items source (static array | value-label map | dynamic {model})
// ---------------------------------------------------------------------------

const select: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const items = ctx.spec.items;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? phpString(ctx.spec.default) : v;
  })();

  // Dynamic source → stub: placeholder option + data-source-* (no fabricated options).
  if (isDynamicItemsSource(items)) {
    const sel =
      `<select name="${escAttr(name)}"` +
      ` class="${escAttr(mainClass(ctx, 'valid-target form-select valid-target-async'))}"` +
      dynamicSourceAttrs(items) +
      mainStyleAttr(ctx) +
      behaviorAttrs(ctx) +
      dataAttrs(ctx) +
      `><option value="">select</option></select>`;
    return `<div class="input-group">${prependSpan(ctx)}${sel}${appendSpan(ctx)}</div>`;
  }

  let optionsHtml = '';
  const entries = itemEntries(items);
  if (entries.length === 0) {
    optionsHtml = `<option value="">select</option>`;
  } else {
    for (const [key, val] of entries) {
      const label = ctx.t(val as never) || phpString(val);
      const sel = effectiveValue === key ? ' selected=""' : '';
      optionsHtml += `<option value="${escAttr(key)}"${sel}>${escText(label)}</option>`;
    }
  }
  const sel =
    `<select name="${escAttr(name)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-select'))}"` +
    mainStyleAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${optionsHtml}</select>`;
  return `<div class="input-group">${prependSpan(ctx)}${sel}${appendSpan(ctx)}</div>`;
};

// ---------------------------------------------------------------------------
// hidden — bare input (no input-group, no behavior, label omitted by render)
// ---------------------------------------------------------------------------

const hidden: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const value = applyDefaultString(ctx.value, ctx.spec.default);
  return (
    `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target'))}"` +
    dataAttrs(ctx) +
    ' />'
  );
};

// ---------------------------------------------------------------------------
// choice / radio — btn-group of radios (one per static item)
// ---------------------------------------------------------------------------

const choice: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const items = ctx.spec.items;
  const dataName = leafName(ctx.path);
  const dataRuleName = ruleNameForPath(ctx.path);
  const onchange = behaviorScript(ctx, 'onchange');
  const onclick = behaviorScript(ctx, 'onclick');
  const onAttrs =
    (onchange ? ` onchange="${escAttr(onchange)}"` : '') +
    (onclick ? ` onclick="${escAttr(onclick)}"` : '');
  // design.main.class fills the per-item LABEL slot (legacy element_class was the label).
  const labelClass = joinClass('btn btn-switch', ctx.design.main.class);

  // Dynamic source → empty btn-group stub (options unknown until hydration).
  if (isDynamicItemsSource(items)) {
    return (
      `<div class="btn-group btn-group-toggle" data-toggle="buttons"${dynamicSourceAttrs(items)}>` +
      `<!-- dynamic-items: model=${escAttr(phpString(items.model))} -->` +
      `</div>`
    );
  }

  const defaultStr =
    ctx.spec.default !== undefined && ctx.spec.default !== null && !Array.isArray(ctx.spec.default)
      ? phpString(ctx.spec.default)
      : null;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? (defaultStr ?? '') : v;
  })();

  const idPrefix = elementId('choice', ctx.path);

  let inner = '';
  itemEntries(items).forEach(([key, label], index) => {
    const value = String(key);
    const text = ctx.t(label as never) || phpString(label);
    const isChecked = effectiveValue === value;
    const isDefault = defaultStr !== null && defaultStr === value;
    const inputId = `${idPrefix}-${index + 1}`;
    inner +=
      `<input id="${escAttr(inputId)}" type="radio" name="${escAttr(name)}"` +
      ` value="${escAttr(value)}"` +
      onAttrs +
      (isChecked ? ' checked=""' : '') +
      ` autocomplete="off" class="valid-target btn-check"` +
      ` data-name="${escAttr(dataName)}" data-rule-name="${escAttr(dataRuleName)}"` +
      ` data-is-default="${isDefault ? '1' : ''}"/>` +
      `<label for="${escAttr(inputId)}" class="${escAttr(labelClass)}">` +
      `<span>${escText(text)}</span></label>`;
  });

  return `<div class="btn-group btn-group-toggle" data-toggle="buttons">${inner}</div>`;
};

// ---------------------------------------------------------------------------
// multichoice / checkboxes — btn-group of checkboxes
// ---------------------------------------------------------------------------

const multichoice: Emitter = (ctx) => {
  const bracketBase = bracketName(ctx);
  const name = leafName(ctx.path).endsWith('[]') ? `${bracketBase}[]` : bracketBase;
  const items = ctx.spec.items;
  const dataName = leafName(ctx.path);
  const dataRuleName = ruleNameForPath(ctx.path);
  const onchange = behaviorScript(ctx, 'onchange');
  const onAttrs = onchange ? ` onchange="${escAttr(onchange)}"` : '';
  const labelClass = joinClass('btn btn-switch btn-mswitch', ctx.design.main.class);

  if (isDynamicItemsSource(items)) {
    return (
      `<div class="btn-group flex-wrap btn-group-toggle"${dynamicSourceAttrs(items)}>` +
      `<!-- dynamic-items: model=${escAttr(phpString(items.model))} -->` +
      `</div>`
    );
  }

  let selectedValues: string[];
  if (Array.isArray(ctx.value)) selectedValues = (ctx.value as unknown[]).map(String);
  else if (ctx.value) selectedValues = [String(ctx.value)];
  else selectedValues = [];
  if (selectedValues.length === 0 && ctx.spec.default !== undefined && ctx.spec.default !== null) {
    selectedValues = Array.isArray(ctx.spec.default)
      ? (ctx.spec.default as unknown[]).map((d) => phpString(d))
      : [phpString(ctx.spec.default)];
  }

  const idPrefix = `mchoice-${cleanStr(name)}`;

  let inner = '';
  itemEntries(items).forEach(([key, label], index) => {
    const value = String(key);
    const text = ctx.t(label as never) || phpString(label);
    const isChecked = selectedValues.includes(value);
    const inputId = `${idPrefix}${index + 1}`;
    inner +=
      `<input type="checkbox" id="${escAttr(inputId)}" name="${escAttr(name)}"` +
      ` value="${escAttr(value)}"` +
      onAttrs +
      (isChecked ? ' checked=""' : '') +
      ` autocomplete="off" class="valid-target btn-check"` +
      ` data-name="${escAttr(dataName)}" data-rule-name="${escAttr(dataRuleName)}"/>` +
      `<label for="${escAttr(inputId)}" class="${escAttr(labelClass)}">` +
      `<span>${escText(text)}</span></label>`;
  });

  return `<div class="btn-group flex-wrap btn-group-toggle">${inner}</div>`;
};

// ---------------------------------------------------------------------------
// date — input-group, type=date with value formatting
// ---------------------------------------------------------------------------

function formatDateValue(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] ?? '';
  } catch {
    /* invalid */
  }
  return value;
}

const date: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const rawValue = applyDefaultString(ctx.value, ctx.spec.default);
  const formatted = formatDateValue(rawValue);
  const input =
    `<input type="date" name="${escAttr(name)}" value="${escAttr(formatted)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    mainStyleAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    ' />';
  return `<div class="input-group">${prependSpan(ctx)}${input}${appendSpan(ctx)}</div>`;
};

// ---------------------------------------------------------------------------
// datetime / datetime-local — BARE input (no input-group)
// ---------------------------------------------------------------------------

function formatDatetimeValue(value: string): string {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value);
  if (m) return m[1] + (m[2] ?? ':00');
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    }
  } catch {
    /* invalid */
  }
  return value;
}

const datetime: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const rawValue = applyDefaultString(ctx.value, ctx.spec.default);
  const formatted = formatDatetimeValue(rawValue);
  // BARE input (no input-group wrapper) — distinct from date/text.
  return (
    `<input type="datetime-local" name="${escAttr(name)}" value="${escAttr(formatted)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    mainStyleAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    ' />'
  );
};

// ---------------------------------------------------------------------------
// dummy / html / static — display-only div (no input, no data-attr trio)
// ---------------------------------------------------------------------------

function nl2br(s: string): string {
  return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

const dummy: Emitter = (ctx) => {
  let v: unknown = ctx.value;
  if ((v === null || v === undefined) && phpTruthy(phpString(ctx.spec.default))) {
    v = ctx.spec.default;
  }
  const items = ctx.spec.items;
  if (items && typeof items === 'object' && !Array.isArray(items) && !isDynamicItemsSource(items)) {
    const looked = (items as Record<string, unknown>)[phpString(v)];
    if (looked !== undefined) v = looked;
  }
  const textVal = phpString(v);
  // RAW html passthrough — value goes through nl2br only (not escaped), legacy parity.
  const html = phpTruthy(textVal) ? nl2br(textVal) : textVal;
  const cls = ctx.design.main.class;
  const style = styleString(ctx.design.main.style);
  return (
    `<div class="${escAttr(cls)}"` +
    (style ? ` style="${escAttr(style)}"` : '') +
    `>${html}</div>`
  );
};

// ---------------------------------------------------------------------------
// dummy-input — always-readonly display input (form-control base, NO rule trio)
// ---------------------------------------------------------------------------

const dummyInput: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const input =
    `<input type="text" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` readonly=""` +
    ` class="${escAttr(mainClass(ctx, 'form-control'))}"` +
    placeholderAttr(ctx) +
    mainStyleAttr(ctx) +
    ` data-default="${escAttr(phpString(ctx.spec.default))}"` +
    '/>';
  return `<div class="input-group">${prependSpan(ctx)}${input}${appendSpan(ctx)}</div>`;
};

// ---------------------------------------------------------------------------
// image — two-input file widget, empty-data branch (input-group)
// ---------------------------------------------------------------------------

/** accept attr: validate.accept (or options.accept), default image/*. */
function acceptAttr(ctx: FieldCtx, fallback: string): string {
  const validate = ctx.spec.validate;
  if (validate && typeof validate === 'object' && !Array.isArray(validate)) {
    const a = (validate as Record<string, unknown>).accept;
    if (typeof a === 'string' && a) return a;
  }
  return optWith(ctx, 'accept', fallback);
}

/** image/file/cover size + preview constraints → data-* attrs (options.*). */
function sizeAttrs(ctx: FieldCtx): string {
  return (
    ` data-max-width="${escAttr(optWith(ctx, 'max_width', '0'))}"` +
    ` data-min-width="${escAttr(optWith(ctx, 'min_width', '0'))}"` +
    ` data-max-height="${escAttr(optWith(ctx, 'max_height', '0'))}"` +
    ` data-min-height="${escAttr(optWith(ctx, 'min_height', '0'))}"` +
    ` data-preview-max-width="${escAttr(optWith(ctx, 'preview_max_width', '0'))}"` +
    ` data-preview-max-height="${escAttr(optWith(ctx, 'preview_max_height', '0'))}"`
  );
}

const image: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, 'image/*');
  const fileClass = joinClass('valid-target form-control-file form-control-image', ctx.design.main.class);
  const html =
    prependSpan(ctx) +
    '<input type="text" class="form-control form-control-file" value="" readonly="readonly" />' +
    `<input type="file" class="${escAttr(fileClass)}"${sizeAttrs(ctx)}` +
    ` name="${escAttr(name)}"` +
    ` data-name="${escAttr(leafName(ctx.path))}" data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    behaviorAttrs(ctx) +
    ` value="" accept="${escAttr(accept)}" />` +
    '<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>';
  return `<div class="input-group">${html}</div>`;
};

// ---------------------------------------------------------------------------
// file — same family as image, empty-data branch
// ---------------------------------------------------------------------------

const file: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, '*/*');
  const fileClass = joinClass('valid-target form-control-file', ctx.design.main.class);
  const html =
    prependSpan(ctx) +
    '<input type="text" class="form-control form-control-file" value="" readonly="readonly" />' +
    `<input type="file" class="${escAttr(fileClass)}"${sizeAttrs(ctx)}` +
    ` name="${escAttr(name)}"` +
    ` data-name="${escAttr(leafName(ctx.path))}" data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    behaviorAttrs(ctx) +
    ` value="" accept="${escAttr(accept)}" />` +
    '<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>';
  return `<div class="input-group">${html}</div>`;
};

// ---------------------------------------------------------------------------
// cover / cover-simple — image family, empty-data branch (single file input)
// ---------------------------------------------------------------------------

const cover: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, 'image/*');
  const fileClass = joinClass(
    'valid-target form-control-file form-control-filetext form-control-image',
    ctx.design.main.class
  );
  const html =
    prependSpan(ctx) +
    `<input type="file" class="${escAttr(fileClass)}"${sizeAttrs(ctx)}` +
    ` name="${escAttr(name)}[name]"` +
    ` data-name="${escAttr(leafName(ctx.path))}" data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    behaviorAttrs(ctx) +
    ` accept="${escAttr(accept)}" />`;
  return `<div class="input-group">${html}</div>`;
};

// ---------------------------------------------------------------------------
// image-viewer — display-only img list (no input, no rule trio)
// ---------------------------------------------------------------------------

const imageViewer: Emitter = (ctx) => {
  const height = optWith(ctx, 'height', '');
  const heightAttr = height ? ` height="${escAttr(height)}"` : '';
  const v = ctx.value;
  const wrapCls = ctx.design.main.class;
  let body: string;
  if (Array.isArray(v) && v.length > 0) {
    body = (v as unknown[])
      .map((row) => `<img src="${escAttr(phpString(row))}"${heightAttr}>`)
      .join('');
  } else {
    // Hardcoded Korean empty literal — kept verbatim (legacy does not translate it).
    body = '이미지가 없습니다.';
  }
  return `<div class="${escAttr(wrapCls)}">${body}</div>`;
};

// ---------------------------------------------------------------------------
// search / autocomplete — select2 host (style/script chrome + select)
// ---------------------------------------------------------------------------

const search: Emitter = (ctx) => {
  const name = bracketName(ctx);
  // Deterministic, path-derived id (unique per field; stable across frameworks).
  const id = elementId('', ctx.path);
  const items = ctx.spec.items;
  const keywordMinLength = optWith(ctx, 'keyword_min_length', '2');
  const delay = optWith(ctx, 'delay', '250');
  const apiServer = optWith(ctx, 'api_server', '');
  const hideSearching = optStr(ctx, 'hide_searching') !== '';
  const onchange = behaviorScript(ctx, 'onchange');
  const onchangeAttr = onchange ? ` onchange="${escAttr(onchange)}"` : '';

  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? phpString(ctx.spec.default) : v;
  })();

  const dynamic = isDynamicItemsSource(items);
  let optionHtml = '';
  if (!dynamic && items !== undefined && items !== null) {
    for (const [key, label] of itemEntries(items)) {
      const value = String(key);
      const text = ctx.t(label as never) || phpString(label);
      const sel = effectiveValue === value ? ' selected="selected"' : '';
      optionHtml += `<option value="${escAttr(value)}"${sel}>${escText(text)}</option>`;
    }
  }
  if (!optionHtml) optionHtml = '<option value="">select</option>';

  const sourceAttrs = dynamic ? dynamicSourceAttrs(items as Record<string, unknown>) : '';
  const selectClass = mainClass(ctx, dynamic ? 'valid-target form-control valid-target-async' : 'valid-target form-control');
  const selectHtml =
    `<select class="${escAttr(selectClass)}"` +
    mainStyleAttr(ctx) +
    ` name="${escAttr(name)}"` +
    ` data-keyword-min-length="${escAttr(keywordMinLength)}" data-delay="${escAttr(delay)}"` +
    ` data-api-server="${escAttr(apiServer)}"` +
    sourceAttrs +
    ` data-name="${escAttr(leafName(ctx.path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(ctx.path))}" id="${escAttr(id)}"${onchangeAttr}` +
    ` data-default="${escAttr(phpString(ctx.spec.default))}">${optionHtml}</select>`;

  const callback = optStr(ctx, 'callback');
  const callbackJs = callback ? `$('#${id}').on('select2:select', ${callback});` : '';
  const styleTag = hideSearching
    ? `<style nonce="">.${id}_select2 .loading-results { display: none; }</style>`
    : '';
  const scriptTag = `<script nonce="">$(function() {select2('${id}', '${keywordMinLength}', '${delay}', '');${callbackJs}});</script>`;
  const divTag = `<div class="input-group field-search">${prependSpan(ctx)}${selectHtml}${appendSpan(ctx)}</div>`;
  return styleTag + scriptTag + divTag;
};

// ---------------------------------------------------------------------------
// rich editors (tinymce/wysiwyg, summernote, editorjs, tui) — textarea/host + init
// ---------------------------------------------------------------------------

const tinymce: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const editorId = elementId('tinymce', ctx.path);
  const rows = optWith(ctx, 'rows', '3');
  const height = optWith(ctx, 'height', '300');
  const upload = optWith(ctx, 'fileserver', 'upload');
  const readonlyJs = 'false';
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const ta =
    `<textarea id="${escAttr(editorId)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control tinymcearea'))}"` +
    ` name="${escAttr(name)}" rows="${escAttr(rows)}"` +
    ` data-type="${escAttr(String(ctx.spec.type ?? 'tinymce'))}" data-height="${escAttr(height)}"` +
    ` data-upload-server="${escAttr(upload)}"` +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${escText(displayValue)}</textarea>`;
  const scriptTag = `<script nonce="">$(function() {editor_tinymce('#${editorId}', ${height}, '${upload}', ${readonlyJs});});</script>`;
  return ta + scriptTag;
};

const summernote: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const editorId = elementId('summernote', ctx.path);
  const rows = optWith(ctx, 'rows', '5');
  const upload = optWith(ctx, 'upload', 'upload');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const ta =
    `<textarea id="${escAttr(editorId)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control summernote'))}"` +
    ` name="${escAttr(name)}" rows="${escAttr(rows)}"` +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${escText(displayValue)}</textarea>`;
  const scriptTag = `<script nonce="">$(function() {editor_summernote('#${editorId}', '${upload}');});</script>`;
  return ta + scriptTag;
};

const editorjs: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const hostId = elementId('editorjs', ctx.path);
  const rows = optWith(ctx, 'rows', '3');
  const fileserver = optWith(ctx, 'fileserver', '');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const ta =
    `<textarea id="${escAttr(hostId)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control contentjs'))}"` +
    ` name="${escAttr(name)}" rows="${escAttr(rows)}"` +
    ` data-fileserver="${escAttr(fileserver)}"` +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${escText(displayValue)}</textarea>`;
  const scriptTag = `<script nonce="">$(function() {editor_editorjs('#${hostId}', '${fileserver}');});</script>`;
  return ta + scriptTag;
};

const tui: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const hostId = elementId('tui', ctx.path);
  const rows = optWith(ctx, 'rows', '3');
  const fileserver = optWith(ctx, 'fileserver', '');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const ta =
    `<textarea id="${escAttr(hostId)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control tuiarea'))}"` +
    ` name="${escAttr(name)}" rows="${escAttr(rows)}"` +
    ` data-fileserver="${escAttr(fileserver)}"` +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    `>${escText(displayValue)}</textarea>`;
  const scriptTag = `<script nonce="">$(function() {editor_tui('#${hostId}', '${fileserver}');});</script>`;
  return ta + scriptTag;
};

// ---------------------------------------------------------------------------
// button / action — click-binder script + hidden field + button
// ---------------------------------------------------------------------------

const button: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const id = name.split('[').join('_').split(']').join('');
  const onclick = behaviorScript(ctx, 'onclick');
  const initScript = optStr(ctx, 'init_script') ?? '';
  // The $(function(){...}) wrapper is type-intrinsic chrome around opaque onclick.
  const script =
    `\n$(function() {\n    ${initScript}\n    $("#btn${id}").on('click', function() {\n        ${onclick}\n    });\n});\n`;
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const textVal = ctx.spec.content !== undefined ? ctx.t(ctx.spec.content as never)
    : ctx.spec.text !== undefined ? ctx.t(ctx.spec.text as never) : '';
  const buttonClass = mainClass(ctx, 'btn');
  const scriptTag = `<script nonce="">${script}</script>`;
  const hidden =
    `<input type="hidden" class="valid-target form-control" readonly=""` +
    ` name="${escAttr(name)}" data-name="${escAttr(leafName(ctx.path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(ctx.path))}" value="${escAttr(displayValue)}"` +
    ` data-default="${escAttr(phpString(ctx.spec.default))}"/>`;
  const btn =
    `<input type="button" class="${escAttr(buttonClass)}"` +
    ` name="btn${escAttr(name)}" id="btn${escAttr(id)}" value="${escAttr(textVal)}"/>`;
  return scriptTag + hidden + btn;
};

// ---------------------------------------------------------------------------
// tagify / tagify2 — text host + init script
// ---------------------------------------------------------------------------

const tagify: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const id = elementId('tagify', ctx.path);
  const maxTags = optWith(ctx, 'max_tags', '0');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const input =
    `<input type="text" id="${escAttr(id)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    ` name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` data-max-tags="${escAttr(maxTags)}"` +
    placeholderAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    '/>';
  const scriptTag = `<script nonce="">$(function() {editor_tagify('#${id}', ${maxTags});});</script>`;
  return input + scriptTag;
};

const tagify2: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const id = elementId('tagify', ctx.path);
  const maxTags = optWith(ctx, 'max_tags', '0');
  const server = optWith(ctx, 'server', '');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const input =
    `<input type="text" id="${escAttr(id)}"` +
    ` class="${escAttr(mainClass(ctx, 'valid-target form-control'))}"` +
    ` name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` data-max-tags="${escAttr(maxTags)}" data-server="${escAttr(server)}"` +
    placeholderAttr(ctx) +
    behaviorAttrs(ctx) +
    dataAttrs(ctx) +
    '/>';
  const scriptTag = `<script nonce="">$(function() {editor_tagify2('#${id}', ${maxTags}, '${server}');});</script>`;
  return input + scriptTag;
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, Emitter> = {
  text,
  string: text,
  email,
  number,
  integer: number,
  float: number,
  decimal: number,
  password,
  textarea,
  select,
  dropdown: select,
  selectbox: select,
  hidden,
  choice,
  radio: choice,
  multichoice,
  checkboxes: multichoice,
  checkcontainer: multichoice,
  date,
  datetime,
  'datetime-local': datetime,
  dummy,
  html: dummy,
  static: dummy,
  'dummy-input': dummyInput,
  image,
  file,
  cover,
  'cover-simple': cover,
  'image-viewer': imageViewer,
  search,
  autocomplete: search,
  tinymce,
  wysiwyg: tinymce,
  summernote,
  editorjs,
  tui,
  button,
  action: button,
  tagify,
  tagify2,
};

/** Returns the inner emitter for a field `type`, or undefined. */
export function getFieldEmitter(type: string): Emitter | undefined {
  return REGISTRY[type.toLowerCase()];
}
