/**
 * list-spec read cell renderer (framework-agnostic core) — markup 0, the ONE
 * new surface list-spec adds over form-spec (SPEC-V2 §9.2). It is the read-side
 * symmetric of widget.ts: where a write widget turns a field `type`+`options`
 * into an INPUT control model, a read cell turns a column `format` (type +
 * isolated dependent keys) into a DISPLAY model — never an input.
 *
 * What it REUSES (no second engine): the same condition/expression engine
 * (expr.ts evalAppearance — for `href` condition maps), the same i18n translator
 * (content.ts makeTranslate — for badge labels, link/bool text, number affixes,
 * choice-label items), and the same Items classification policy as widget.ts
 * (static map/array → enumerated; dynamic `{ model, ... }` → preserved, never
 * fabricated). The catalog (SPEC §9.2): text/date/number/badge/link/
 * choice-label/bool/image/html.
 *
 * `cell.display` is a plain string for text/date/number/choice-label/html, and a
 * STRUCTURED value for badge (variant+label), link (href+text+target), image
 * (src+alt+size), bool (label+as) — the adapter assembles the element, it
 * recomputes nothing. The raw `cell.value` (read from the injected row by the
 * column `field` path) is kept beside `display` for debug/sort/key. eval is
 * never called.
 */

import type { PathContext } from '@form-spec/validator';
import { evalAppearance } from './expr';
import type { Translate, LocalizedText } from './content';
import { getValueByPath } from './util';

/** A resolved cell format: the catalog type + its isolated dependent keys. */
export interface CellFormatModel {
  /** Catalog type (SPEC §9.2). Defaults to 'text'. */
  type: string;
  /** The original (composed) format object — opaque dependents pass through. */
  options: Record<string, unknown>;
}

/** A badge display: a CSS/variant token plus its translated label. */
export interface BadgeDisplay {
  kind: 'badge';
  /** Variant token from the value→variant map (e.g. 'success', 'danger'). */
  variant: string;
  /** Translated label for the value (defaults to the value itself). */
  label: string;
}

/** A link display: resolved href + text + target. */
export interface LinkDisplay {
  kind: 'link';
  /** href with `.field` interpolation applied (condition map resolved). */
  href: string;
  /** Translated link text (defaults to the cell value). */
  text: string;
  /** Optional link target (`_blank`, …). */
  target?: string;
}

/** An image display: resolved src + alt + size. */
export interface ImageDisplay {
  kind: 'image';
  /** Image source (the cell value, `.field` interpolation applied if a path). */
  src: string;
  /** Translated alt text (`.field` interpolated). */
  alt: string;
  width?: string;
  height?: string;
}

/** A boolean display: the chosen label + the requested form. */
export interface BoolDisplay {
  kind: 'bool';
  /** The resolved boolean. */
  value: boolean;
  /** Translated true/false label. */
  label: string;
  /** Display form: 'text' | 'icon' | 'check' (default 'text'). */
  as: string;
}

/** A raw-html display: passed through unescaped by the adapter. */
export interface HtmlDisplay {
  kind: 'html';
  /** Raw HTML markup (NOT escaped — the adapter must dangerouslySetInnerHTML). */
  html: string;
}

/** The display payload a cell renderer emits: a string or a structured value. */
export type CellDisplay =
  | string
  | BadgeDisplay
  | LinkDisplay
  | ImageDisplay
  | BoolDisplay
  | HtmlDisplay;

// ---------------------------------------------------------------------------
// format normalization (CellFormat polymorphism — false|true|string|{object})
// ---------------------------------------------------------------------------

/**
 * Normalize a polymorphic `CellFormat` into `{ type, options }`. `false`/
 * `true`/absent → plain text; a bare string → that type with no dependents; an
 * object → its `type` (default 'text') plus the object as dependent options.
 */
export function normalizeFormat(format: unknown): CellFormatModel {
  if (format === undefined || format === null || format === false || format === true) {
    return { type: 'text', options: {} };
  }
  if (typeof format === 'string') {
    return { type: format || 'text', options: {} };
  }
  if (typeof format === 'object' && !Array.isArray(format)) {
    const o = format as Record<string, unknown>;
    const type = typeof o.type === 'string' && o.type ? o.type : 'text';
    return { type, options: o };
  }
  return { type: 'text', options: {} };
}

// ---------------------------------------------------------------------------
// items classification (the SAME policy as widget.ts — static vs dynamic model)
// ---------------------------------------------------------------------------

/** A DYNAMIC items source is a `{ model, ... }` descriptor (preserved, not read). */
function isDynamicItemsSource(items: unknown): items is Record<string, unknown> {
  return (
    items !== null &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    'model' in (items as Record<string, unknown>)
  );
}

/** Static items → a value→label lookup. Dynamic source → empty (never enumerate). */
function itemsLookup(items: unknown): Record<string, unknown> {
  if (items === null || items === undefined) return {};
  if (Array.isArray(items)) {
    const out: Record<string, unknown> = {};
    items.forEach((v, i) => {
      out[String(i)] = v;
    });
    return out;
  }
  if (typeof items === 'object') {
    if (isDynamicItemsSource(items)) return {};
    return items as Record<string, unknown>;
  }
  return {};
}

// ---------------------------------------------------------------------------
// scalar formatting helpers
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? '1' : '';
  if (Array.isArray(value) || typeof value === 'object') return '';
  return String(value);
}

function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '' && value !== '0' && value !== 'false';
  return value !== null && value !== undefined && value !== '';
}

function truncate(s: string, n: unknown): string {
  const limit = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(limit) || limit <= 0 || s.length <= limit) return s;
  return s.slice(0, limit) + '…';
}

/** Date format: pattern tokens YYYY/MM/DD/HH/mm/ss against the value's date parts. */
function formatDate(value: unknown, pattern: unknown): string {
  const s = asString(value);
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  const pat = typeof pattern === 'string' && pattern ? pattern : 'YYYY-MM-DD';
  return pat
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

/** Number format: decimals + thousands grouping; prefix/suffix are i18n content. */
function formatNumber(
  value: unknown,
  opts: Record<string, unknown>,
  t: Translate
): string {
  const n = typeof value === 'number' ? value : Number(asString(value));
  if (!Number.isFinite(n)) return asString(value);
  const decimals = typeof opts.decimals === 'number' ? opts.decimals : undefined;
  let body = decimals !== undefined ? n.toFixed(decimals) : String(n);
  if (opts.thousands) {
    const [intPart, frac] = body.split('.');
    const grouped = (intPart ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    body = frac !== undefined ? `${grouped}.${frac}` : grouped;
  }
  const prefix = opts.prefix !== undefined ? t(opts.prefix as LocalizedText) : '';
  const suffix = opts.suffix !== undefined ? t(opts.suffix as LocalizedText) : '';
  return `${prefix}${body}${suffix}`;
}

/**
 * Interpolate `.field` references in a template against the current row. A bare
 * `.path` token (leading dot) reads the row value at that path; the special
 * `.field` / the raw cell value substitute the column's own value.
 */
function interpolate(
  template: string,
  row: Record<string, unknown>,
  cellValue: unknown
): string {
  return template.replace(/\.[A-Za-z_][\w.]*/g, (token) => {
    const path = token.slice(1);
    if (path === 'field') return asString(cellValue);
    const v = getValueByPath(row, path);
    return v === undefined ? asString(cellValue) : asString(v);
  });
}

// ---------------------------------------------------------------------------
// the cell renderer (CellFormat + raw value → CellDisplay)
// ---------------------------------------------------------------------------

/** Inputs the cell renderer needs to produce one cell's display value. */
export interface CellRenderCtx {
  /** The whole injected row (for `.field` interpolation in href/alt). */
  row: Record<string, unknown>;
  /** Expr engine context for the cell's `field` path (href condition maps). */
  expr: PathContext;
  /** Active-language translator. */
  t: Translate;
}

/**
 * Render one cell: dispatch on the normalized format type and produce the
 * display payload. Unknown types fall back to text (never throw out of render).
 */
export function renderCell(
  format: CellFormatModel,
  value: unknown,
  ctx: CellRenderCtx
): CellDisplay {
  const o = format.options;
  switch (format.type) {
    case 'date':
      return formatDate(value, o.pattern);

    case 'number':
      return formatNumber(value, o, ctx.t);

    case 'badge': {
      const map = (o.map as Record<string, unknown>) ?? {};
      const key = asString(value);
      // map is value→variant; the variant may be an i18n label (LangMap). A
      // plain-string variant is a style token and the value text is the label;
      // an i18n-object variant resolves to a string used as BOTH variant + label.
      const raw = key in map ? map[key] : undefined;
      if (typeof raw === 'object' && raw !== null) {
        const resolved = ctx.t(raw as LocalizedText);
        return { kind: 'badge', variant: resolved, label: resolved };
      }
      return { kind: 'badge', variant: raw === undefined ? '' : asString(raw), label: key };
    }

    case 'link': {
      const rawHref = o.href;
      let hrefTemplate: string;
      if (typeof rawHref === 'string') {
        hrefTemplate = rawHref;
      } else if (rawHref && typeof rawHref === 'object') {
        // condition map → shared expr engine resolves the winning branch.
        hrefTemplate = evalAppearance(rawHref, ctx.expr);
      } else {
        hrefTemplate = '';
      }
      const href = interpolate(hrefTemplate, ctx.row, value);
      const text =
        o.text !== undefined && o.text !== null && o.text !== ''
          ? ctx.t(o.text as LocalizedText)
          : asString(value);
      const out: LinkDisplay = { kind: 'link', href, text };
      if (typeof o.target === 'string' && o.target) out.target = o.target;
      return out;
    }

    case 'choice-label': {
      const lookup = itemsLookup(o.items);
      const key = asString(value);
      if (key in lookup) {
        const label = lookup[key];
        return typeof label === 'object' && label !== null
          ? ctx.t(label as LocalizedText)
          : asString(label);
      }
      // dynamic {model} source or unknown key → preserve the raw code (never fabricate).
      return key;
    }

    case 'bool': {
      const b = truthy(value);
      const labelSource = b ? o.true : o.false;
      const label =
        labelSource !== undefined && labelSource !== null
          ? ctx.t(labelSource as LocalizedText)
          : b
          ? 'true'
          : 'false';
      const as = typeof o.as === 'string' && o.as ? o.as : 'text';
      return { kind: 'bool', value: b, label, as };
    }

    case 'image': {
      // src is the raw cell value (a URL/path) — NOT an interpolation template.
      const src = asString(value);
      const alt =
        o.alt !== undefined && o.alt !== null
          ? interpolate(ctx.t(o.alt as LocalizedText), ctx.row, value)
          : '';
      const out: ImageDisplay = { kind: 'image', src, alt };
      if (o.width !== undefined) out.width = asString(o.width);
      if (o.height !== undefined) out.height = asString(o.height);
      return out;
    }

    case 'html':
      return { kind: 'html', html: asString(value) };

    case 'text':
    default: {
      const s = asString(value);
      return o.truncate !== undefined ? truncate(s, o.truncate) : s;
    }
  }
}
