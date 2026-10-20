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

import type { AnyWidget, WidgetModel } from '@polyspec/crudui-generator-core';
import {
  affixHtml,
  escAttr,
  escText,
  hasEventAttr,
  isUnsupported,
  rawControl,
  rawVoid,
  widgetRootHtml,
} from '@polyspec/crudui-generator-core/internal';

export { affixHtml };

export type { AnyWidget };

export { isUnsupported };

/** Keep an ordinary editable control as one DOM element across value updates. */
export function usesStableControl(w: WidgetModel): boolean {
  return (w.layout === 'widget' || w.layout === 'bare')
    && (w.tag === 'input' || w.tag === 'textarea') && !hasEventAttr(w.attrs);
}

// ---------------------------------------------------------------------------
// container-body html (the bytes injected into a real container element)
// ---------------------------------------------------------------------------

/** widget body: prepend? + control + append?. */
export function widgetBody(w: WidgetModel): string {
  return affixHtml(w.prepend) + rawControl(w) + affixHtml(w.append);
}

/** range body: prepend? + range input + output + append?, inside .crudui-widget--range. */
export function rangeBody(w: WidgetModel): string {
  const forAttr = w.attrs.id !== undefined ? ` for="${escAttr(w.attrs.id)}"` : '';
  const output = `<output class="crudui-widget__output"${forAttr}>${escText(w.text ?? '')}</output>`;
  return affixHtml(w.prepend) + rawVoid('input', w.attrs) + output + affixHtml(w.append);
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
      ? `<button class="crudui-widget__button" type="button">&nbsp;</button>`
      : '')
  );
}

/**
 * When a widget's control(s) sit DIRECTLY under the node body (no
 * widget-level container element), return its raw html so the node injects it into
 * the body via `{@html}`; else null and Widget.svelte renders a real
 * container element. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), button (a button element with its content), choices (choice/
 * multichoice) and search — all carry empty/boolean control attrs svelte/server
 * would mangle as real elements.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  return widgetRootHtml(w, (bare) => (usesStableControl(bare) ? null : rawControl(bare)));
}
