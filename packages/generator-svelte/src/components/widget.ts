/**
 * CRUDUI Svelte widget byte-builders — control bodies only, NO structural markup.
 *
 * Each function turns the core's evaluated `WidgetModel` (markup-free) into the
 * raw HTML required for exact control attributes, embedded behavior and display
 * content. Widget.svelte renders ordinary inputs and textareas as stable Svelte
 * elements and uses these serializers for the remaining control bodies.
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

/** Return whether a control contains browser-executed behavior attributes. */
export function hasEventAttr(attrs: Attrs): boolean {
  return Object.keys(attrs).some(name => name.startsWith('on'));
}

/** Keep an ordinary editable control as one DOM element across value updates. */
export function usesStableControl(w: WidgetModel): boolean {
  return (w.layout === 'input-group' || w.layout === 'bare')
    && (w.tag === 'input' || w.tag === 'textarea') && !hasEventAttr(w.attrs);
}

/** Raw prepend/append affix span html. */
export function affixHtml(affix?: Affix): string {
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
 * When a widget's control(s) sit DIRECTLY under the node body (no
 * widget-level container element), return its raw html so the node injects it into
 * the body via `{@html}`; else null and Widget.svelte renders a real
 * container element. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), button (script + hidden + button), btn-group (choice/
 * multichoice) and search — all carry empty/boolean control attrs svelte/server
 * would mangle as real elements.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare') return usesStableControl(w) ? null : rawControl(w);
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
