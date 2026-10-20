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
 * radio/checkbox pairs) are serialized to a raw HTML string (raw.ts) and written
 * into the container vnode by `rawContainer`: server rendering writes it as the
 * container's content and the browser patches later markup into the existing
 * nodes, so a re-render keeps the focused control. This is forced by
 * `vue/server-renderer`: it coerces every empty-valued attribute to a bare
 * attribute (`data-default=""` → `data-default`) and every boolean-attr name to
 * bare (`readonly="readonly"` → `readonly`), which the React-frozen parity fixture
 * forbids — every control carries `data-default=""`. So a control rendered as a
 * real vnode cannot match the fixture; the container stays a real vnode and only
 * the control bytes are raw. This is the same raw-content boundary as React's
 * sanctioned RAW/script/behavior boundaries, applied at control granularity
 * because Vue's serializer requires it. There is NO completed-form HTML echo.
 *
 * Sanctioned real-vnode-leaf cases (no empty/boolean attribute hazard): the
 * display RAW `<div>` (dummy/image-viewer body via innerHTML=rawHtml — already a
 * verbatim-content boundary) and the unsupported marker `<div>`.
 */

import { h, type VNode } from 'vue';
import type { AnyWidget, WidgetModel } from '@polyspec/crudui-generator-core';
import { plainProps } from './attrs.js';
import { rawContainer } from './raw.js';
import {
  affixHtml,
  escAttr,
  escText,
  rawControl,
  rawVoid,
  isUnsupported,
  widgetRootHtml,
} from '@polyspec/crudui-generator-core/internal';

/** Widget model accepted by the renderer, including unsupported markers. */
export type { AnyWidget };

// ---------------------------------------------------------------------------
// raw control / affix serialization (control bytes only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// container vnodes (real) with raw control bodies
// ---------------------------------------------------------------------------

/** widget layout: prepend? + control + append? inside .crudui-widget. */
function widgetVNode(w: WidgetModel): VNode {
  const html = affixHtml(w.prepend) + rawControl(w) + affixHtml(w.append);
  return rawContainer('div', { class: 'crudui-widget' }, html);
}

/** range layout: prepend? + range input + output + append? inside .crudui-widget--range. */
function rangeVNode(w: WidgetModel): VNode {
  const forAttr = w.attrs.id !== undefined ? ` for="${escAttr(w.attrs.id)}"` : '';
  const output = `<output class="crudui-widget__output"${forAttr}>${escText(w.text ?? '')}</output>`;
  const html = affixHtml(w.prepend) + rawVoid('input', w.attrs) + output + affixHtml(w.append);
  return rawContainer('div', { class: 'crudui-widget crudui-widget--range' }, html);
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
  return rawContainer('div', { class: 'crudui-widget' }, html);
}

/** display layout: dummy/dummy-input/image-viewer. */
function displayVNode(w: WidgetModel): VNode {
  if (w.kind === 'dummy-input') {
    // dummy-input is a widget control, not a RAW div.
    return widgetVNode(w);
  }
  // RAW html display (dummy/image-viewer) — unescaped content, on a
  // real container vnode (the sanctioned verbatim-content boundary).
  return h('div', { ...plainProps(w.attrs), innerHTML: w.rawHtml ?? '' });
}

// ---------------------------------------------------------------------------
// root-raw layouts (control is a direct child of the node body)
// ---------------------------------------------------------------------------

/**
 * When a widget's control(s) sit DIRECTLY under the node body (no
 * widget-level container element), return its raw html so the node renderer writes it
 * into the body with `rawContainer`; else null and the widget renders as a real
 * container vnode. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), and button (a button element with its content) — all carry
 * empty/boolean or opaque on* control attrs Vue would mangle as real vnodes.
 */
export const widgetRootRaw: (w: AnyWidget) => string | null = widgetRootHtml;

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
    case 'range':
      return rangeVNode(w);
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
