/**
 * CRUDUI Vue widget renderer — real `h()` vnode containers, raw control bodies.
 *
 * Each layout receives the core's evaluated `WidgetModel` (markup-free) and
 * returns a genuine Vue vnode (or vnode array) for its CONTAINER structure
 * (`.crudui-widget` / `.crudui-choices` / `.crudui-widget--search` / display `<div>` /
 * `<script>`/`<style>` chrome). It RECOMPUTES NOTHING — every class string, data-*
 * value, item list, and script is already evaluated by the core.
 *
 * Leaf CONTROL elements (`<input>`/`<select>`/`<textarea>` and the per-item
 * radio/checkbox pairs) are serialized to a raw HTML string (raw.ts) and injected
 * via the container vnode's `innerHTML` domProp. This is forced by
 * `vue/server-renderer`: it coerces every empty-valued attribute to a bare
 * attribute (`data-default=""` → `data-default`) and every boolean-attr name to
 * bare (`readonly="readonly"` → `readonly`), which the React-frozen parity fixture
 * forbids — every control carries `data-default=""`. So a control rendered as a
 * real vnode cannot match the fixture; the container stays a real vnode and only
 * the control bytes are raw. This is the same `innerHTML` mechanism as React's
 * sanctioned RAW/script/behavior boundaries, applied at control granularity
 * because Vue's serializer requires it. There is NO completed-form HTML echo.
 *
 * Sanctioned real-vnode-leaf cases (no empty/boolean attribute hazard): the
 * display RAW `<div>` (dummy/image-viewer body via innerHTML=rawHtml — already a
 * verbatim-content boundary) and the unsupported marker `<div>`.
 */

import { h, type VNode } from 'vue';
import type { WidgetModel, OptionModel, Affix, Attrs } from '@crudui/generator-core';
import type { UnsupportedVM } from '@crudui/generator-core';
import { plainProps } from './attrs';
import {
  rawVoid,
  rawElement,
  rawOptions,
  serializeAttrs,
  escAttr,
  escText,
} from './raw';

/** Widget model accepted by the renderer, including unsupported markers. */
export type AnyWidget = WidgetModel | UnsupportedVM;

function isUnsupported(w: AnyWidget): w is UnsupportedVM {
  return (w as UnsupportedVM).unsupported === true;
}

// ---------------------------------------------------------------------------
// raw control / affix serialization (control bytes only)
// ---------------------------------------------------------------------------

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

/** Raw serialization of one choice (input + label). */
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
    class: 'valid-target crudui-choices__input',
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
// container vnodes (real) with raw control bodies
// ---------------------------------------------------------------------------

/** widget layout: prepend? + control + append? inside .crudui-widget. */
function widgetVNode(w: WidgetModel): VNode {
  const html = affixHtml(w.prepend) + rawControl(w) + affixHtml(w.append);
  return h('div', { class: 'crudui-widget', innerHTML: html });
}

/**
 * choices layout raw html: `<div {attrs}>` + per-item input/label pairs. The
 * container is serialized raw (not a vnode) because its own `w.attrs` may carry
 * empty-valued attributes (`data-source-method=""` on a dynamic stub) that Vue
 * would coerce to bare; the per-item inputs carry `data-is-default=""`/`checked=""`
 * the same way. The node renderer injects this into the node body.
 */
function choicesHtml(w: WidgetModel): string {
  const type: 'radio' | 'checkbox' = w.kind === 'choice' ? 'radio' : 'checkbox';
  const shared = (w.extra?.input ?? {}) as Attrs;
  const labelClass = w.itemLabelClass ?? '';
  const body = (w.options ?? [])
    .map((o) => groupButtonHtml(o, type, shared, labelClass))
    .join('');
  return `<div${serializeAttrs(w.attrs)}>${body}</div>`;
}

/** file layout: image/file (display+file+button) or cover (single file). */
function fileGroupVNode(w: WidgetModel): VNode {
  const display = w.extra?.display;
  const fileAttrs = w.extra?.file ?? {};
  const html =
    affixHtml(w.prepend) +
    (display
      ? rawVoid('input', display)
      : '') +
    rawVoid('input', fileAttrs) +
    (display ? `<button class="crudui-widget__button" type="button">&nbsp;</button>` : '');
  return h('div', { class: 'crudui-widget', innerHTML: html });
}

/** display layout: dummy/dummy-input/image-viewer. */
function displayVNode(w: WidgetModel): VNode {
  if (w.kind === 'dummy-input') {
    // dummy-input is a widget control, not a RAW div.
    return widgetVNode(w);
  }
  // RAW html display (dummy/image-viewer) — unescaped legacy parity content, on a
  // real container vnode (the sanctioned verbatim-content boundary).
  return h('div', { ...plainProps(w.attrs), innerHTML: w.rawHtml ?? '' });
}

/**
 * search layout raw html: style?/script chrome (`nonce=""`, verbatim) + the
 * select2 host `<select>` inside `.crudui-widget--search`. Serialized raw (not
 * vnodes) because the chrome's `nonce=""` and the select's `data-default=""` are
 * empty-valued, and the host select needs `selected="selected"` (legacy select2
 * contract) — all of which Vue's serializer would coerce. The node renderer
 * injects this into the node body.
 */
function searchHtml(w: WidgetModel): string {
  const fieldSearch =
    `<div class="crudui-widget crudui-widget--search">` +
    affixHtml(w.prepend) +
    rawElement('select', w.attrs, rawOptions(w.options ?? [], 'selected')) +
    affixHtml(w.append) +
    `</div>`;
  const style = w.styleChrome ? `<style nonce="">${w.styleChrome}</style>` : '';
  const script = `<script nonce="">${w.script ?? ''}</script>`;
  return style + script + fieldSearch;
}

// ---------------------------------------------------------------------------
// root-raw layouts (control is a direct child of the node body)
// ---------------------------------------------------------------------------

/**
 * When a widget's control(s) sit DIRECTLY under the node body (no
 * widget-level container element), return its raw html so the node renderer injects it
 * into the body via innerHTML; else null and the widget renders as a real
 * container vnode. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), and button (script + hidden + button) — all carry empty/
 * boolean control attrs Vue would mangle as real vnodes.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare') return rawControl(w);
  if (w.layout === 'host-script') {
    return rawControl(w) + `<script nonce="">${w.script ?? ''}</script>`;
  }
  if (w.layout === 'button') {
    const hidden = w.extra?.hidden ?? {};
    return (
      `<script nonce="">${w.script ?? ''}</script>` +
      rawVoid('input', hidden) +
      rawVoid('input', w.attrs)
    );
  }
  if (w.layout === 'choices') return choicesHtml(w);
  if (w.layout === 'search') return searchHtml(w);
  return null;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/**
 * Render one widget model as a real container vnode. Returns null for the
 * root-raw layouts (bare/host-script/button/choices/search) — the node renderer
 * renders those via widgetRootRaw in the node body. Returns the
 * unsupported marker as a real vnode.
 */
export function Widget(w: AnyWidget): VNode | null {
  if (isUnsupported(w)) {
    return h('div', { class: 'crudui-widget crudui-widget--unsupported', 'data-unsupported-type': w.type });
  }
  switch (w.layout) {
    case 'widget':
      return widgetVNode(w);
    case 'file':
      return fileGroupVNode(w);
    case 'display':
      return displayVNode(w);
    case 'bare':
    case 'host-script':
    case 'button':
    case 'choices':
    case 'search':
      // Root-raw layouts render in the node body (widgetRootRaw).
      return null;
    default:
      return null;
  }
}
