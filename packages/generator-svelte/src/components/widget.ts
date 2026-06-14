/**
 * CRUDUI Svelte widget byte-builders — control bodies only, NO structural markup.
 *
 * Each function turns the core's evaluated `WidgetModel` (markup-free) into the
 * raw HTML of its leaf CONTROL bytes (`<input>` / `<select><option>` / `<textarea>`
 * and the per-item radio/checkbox pairs). Widget.svelte owns the real container
 * element (`.input-group` / `.btn-group` / `.input-group field-search` / display
 * `<div>` / `<script>`/`<style>` chrome) and injects these bytes via `{@html}`.
 *
 * It RECOMPUTES NOTHING — every class string, data-* value, item list, and script
 * is already evaluated by the core. The raw path is forced by svelte/server's
 * boolean-attr coercion (see raw.ts); it is the same control-granularity boundary
 * the Vue adapter uses. There is NO completed-form HTML echo: only control bytes,
 * display RAW, script/style chrome, and behavior on* attrs pass through `{@html}`.
 */

import type { WidgetModel, OptionModel, Affix, Attrs } from '@crudui/generator-core';
import type { UnsupportedVM } from '@crudui/generator-core';
import { rawVoid, rawElement, rawOptions, serializeAttrs, escAttr, escText } from './raw';

export type AnyWidget = WidgetModel | UnsupportedVM;

export function isUnsupported(w: AnyWidget): w is UnsupportedVM {
  return (w as UnsupportedVM).unsupported === true;
}

/** Raw prepend/append affix span html. */
function affixHtml(affix?: Affix): string {
  if (!affix) return '';
  const cls = affix.class ? ` class="${escAttr(affix.class)}"` : '';
  const style = affix.style ? ` style="${escAttr(affix.style)}"` : '';
  return `<span${cls}${style}>${escText(affix.text)}</span>`;
}

/** Raw serialization of one main control (input/select/textarea). */
function rawControl(w: WidgetModel, selectedAttr: 'empty' | 'selected' = 'empty'): string {
  if (w.tag === 'select') {
    return rawElement('select', w.attrs, rawOptions(w.options ?? [], selectedAttr));
  }
  if (w.tag === 'textarea') {
    return rawElement('textarea', w.attrs, escText(w.text ?? ''));
  }
  return rawVoid('input', w.attrs);
}

/** Raw serialization of one btn-group button (input + label). */
function groupButtonHtml(
  o: OptionModel,
  type: 'radio' | 'checkbox',
  shared: Attrs,
  labelClass: string
): string {
  const attrs: Attrs = {
    ...shared,
    type,
    value: o.value,
    autocomplete: 'off',
    class: 'valid-target btn-check',
    ...(o.id ? { id: o.id } : {}),
  };
  if (type === 'radio') attrs['data-is-default'] = o.isDefault ? '1' : '';
  const checked = o.selected ? ' checked=""' : '';
  const input = `<input${serializeAttrs(attrs)}${checked}>`;
  const forAttr = o.id ? ` for="${escAttr(o.id)}"` : '';
  return (
    input +
    `<label${forAttr} class="${escAttr(labelClass)}"><span>${escText(o.label)}</span></label>`
  );
}

// ---------------------------------------------------------------------------
// container-body html (the bytes injected into a real container element)
// ---------------------------------------------------------------------------

/** input-group body: prepend? + control + append?. */
export function inputGroupBody(w: WidgetModel): string {
  return affixHtml(w.prepend) + rawControl(w) + affixHtml(w.append);
}

/** btn-group full html: `<div {attrs}>` + per-item input/label pairs. */
export function btnGroupHtml(w: WidgetModel): string {
  const type: 'radio' | 'checkbox' = w.kind === 'choice' ? 'radio' : 'checkbox';
  const shared = (w.extra?.input ?? {}) as Attrs;
  const labelClass = w.itemLabelClass ?? '';
  const body = (w.options ?? [])
    .map((o) => groupButtonHtml(o, type, shared, labelClass))
    .join('');
  return `<div${serializeAttrs(w.attrs)}>${body}</div>`;
}

/** file-group body: image/file (display+file+button) or cover (single file). */
export function fileGroupBody(w: WidgetModel): string {
  const display = w.extra?.display;
  const fileAttrs = w.extra?.file ?? {};
  return (
    affixHtml(w.prepend) +
    (display ? rawVoid('input', display) : '') +
    rawVoid('input', fileAttrs) +
    (display
      ? `<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>`
      : '')
  );
}

/**
 * search full html: style?/script chrome (`nonce=""`, verbatim) + the select2
 * host `<select>` inside `.input-group field-search`. The host select needs
 * `selected="selected"` (legacy select2 contract), so the whole search body is raw.
 */
export function searchHtml(w: WidgetModel): string {
  const fieldSearch =
    `<div class="input-group field-search">` +
    affixHtml(w.prepend) +
    rawElement('select', w.attrs, rawOptions(w.options ?? [], 'selected')) +
    affixHtml(w.append) +
    `</div>`;
  const style = w.styleChrome ? `<style nonce="">${w.styleChrome}</style>` : '';
  const script = `<script nonce="">${w.script ?? ''}<\/script>`;
  return style + script + fieldSearch;
}

/**
 * When a widget's control(s) sit DIRECTLY under `.input-group-wrapper` (no
 * widget-level container element), return its raw html so the field injects it at
 * the wrapper root via `{@html}`; else null and Widget.svelte renders a real
 * container element. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), button (script + hidden + button), btn-group (choice/
 * multichoice) and search — all carry empty/boolean control attrs svelte/server
 * would mangle as real elements.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare') return rawControl(w);
  if (w.layout === 'host-script') {
    return rawControl(w) + `<script nonce="">${w.script ?? ''}<\/script>`;
  }
  if (w.layout === 'button') {
    const hidden = w.extra?.hidden ?? {};
    return (
      `<script nonce="">${w.script ?? ''}<\/script>` +
      rawVoid('input', hidden) +
      rawVoid('input', w.attrs)
    );
  }
  if (w.layout === 'btn-group') return btnGroupHtml(w);
  if (w.layout === 'search') return searchHtml(w);
  return null;
}

/** Row action buttons (plus/minus/copy/move) as a raw string (for root-raw rows). */
export function rowButtonsHtml(s: {
  show: boolean;
  max?: number;
  copy?: boolean;
  sortable?: boolean;
}): string {
  let html = '';
  if (s.sortable) {
    html += `<button type="button" class="btn btn-move-up"> </button>`;
    html += `<button type="button" class="btn btn-move-down"> </button>`;
  }
  const maxAttr = s.max !== undefined ? ` data-multiple-max="${s.max}"` : '';
  html += `<button type="button" class="btn btn-plus"${maxAttr}> </button>`;
  if (s.copy) html += `<button type="button" class="btn btn-copy"> </button>`;
  const minusCls = s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus';
  html += `<button type="button" class="${minusCls}"> </button>`;
  return html;
}
