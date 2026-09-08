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
import type { WidgetModel } from '@crudui/generator-core';
import type { UnsupportedVM } from '@crudui/generator-core';
export type AnyWidget = WidgetModel | UnsupportedVM;
export declare function isUnsupported(w: AnyWidget): w is UnsupportedVM;
/** input-group body: prepend? + control + append?. */
export declare function inputGroupBody(w: WidgetModel): string;
/** btn-group full html: `<div {attrs}>` + per-item input/label pairs. */
export declare function btnGroupHtml(w: WidgetModel): string;
/** file-group body: image/file (display+file+button) or cover (single file). */
export declare function fileGroupBody(w: WidgetModel): string;
/**
 * search full html: style?/script chrome (`nonce=""`, verbatim) + the select2
 * host `<select>` inside `.input-group field-search`. The host select needs
 * `selected="selected"` (legacy select2 contract), so the whole search body is raw.
 */
export declare function searchHtml(w: WidgetModel): string;
/**
 * When a widget's control(s) sit DIRECTLY under `.input-group-wrapper` (no
 * widget-level container element), return its raw html so the field injects it at
 * the wrapper root via `{@html}`; else null and Widget.svelte renders a real
 * container element. Covers bare (datetime/password/hidden/email), host-script
 * (editors/tagify), button (script + hidden + button), btn-group (choice/
 * multichoice) and search — all carry empty/boolean control attrs svelte/server
 * would mangle as real elements.
 */
export declare function widgetRootRaw(w: AnyWidget): string | null;
/** Row action buttons (plus/minus/copy/move) as a raw string (for root-raw rows). */
export declare function rowButtonsHtml(s: {
    show: boolean;
    max?: number;
    copy?: boolean;
    sortable?: boolean;
}): string;
//# sourceMappingURL=widget.d.ts.map