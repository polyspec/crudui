/**
 * v2 type-specific inner emitters (Svelte) — the `.input-group` inner markup per
 * field type. Structure (envelope, input-group, data-attr trio) is the verified
 * Limepie envelope (generator-svelte/src/fieldHtml.ts REGISTRY); APPEARANCE is
 * taken from the resolved `design` node map (main node class/style, prepend
 * node), and CONTENT (placeholder/prepend/append) from `t()` over LocalizedText.
 * NO v1 meta key (element_class/prepend_class/style) is read here.
 *
 * The main-node class base is always `valid-target form-control`
 * (`valid-target form-select` for select); the resolved `design.class` is
 * appended (the v1 element_class slot). The data-attr trio
 * (data-name/data-rule-name/data-default) is the limepie validation contract.
 * These emitters are byte-identical to the React v2 reference; the shared parity
 * gate (tests/fixtures/v2-render) pins them.
 */

import {
  applyDefaultString,
  escAttr,
  escText,
  joinClass,
  leafName,
  phpString,
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
 * `{ script }`.
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
// select — items source (static array | value-label map)
// ---------------------------------------------------------------------------

function itemEntries(items: unknown): Array<[string, unknown]> {
  if (items === null || items === undefined) return [];
  if (Array.isArray(items)) return items.map((v, i) => [String(i), v]);
  if (typeof items === 'object') return Object.entries(items as Record<string, unknown>);
  return [];
}

const select: Emitter = (ctx) => {
  const name = bracketName(ctx);
  const items = ctx.spec.items;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? phpString(ctx.spec.default) : v;
  })();

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
// hidden
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
  hidden,
};

/** Returns the inner emitter for a field `type`, or undefined. */
export function getFieldEmitter(type: string): Emitter | undefined {
  return REGISTRY[type.toLowerCase()];
}
