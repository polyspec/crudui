/**
 * CRUDUI Svelte adapter — control-byte raw serializer.
 *
 * svelte/server coerces a dynamically-spread boolean attribute to its bare form
 * (`readonly="readonly"` → `readonly=""`, `selected="selected"` → `selected=""`,
 * `checked="checked"` → `checked=""`); empty-valued attrs (`data-default=""`,
 * `value=""`) are kept verbatim. The parity fixture requires `readonly="readonly"`
 * (file/image display), `selected="selected"` (search host) AND `data-default=""`
 * on the SAME control, and the shared normalizer (N3) preserves presence but does
 * NOT restore a coerced value. A control rendered through dynamic spread therefore
 * cannot match the fixture. So the leaf CONTROL bytes are serialized here to a raw
 * HTML string and emitted through the container's `{@html}` directive, which
 * svelte/server passes through verbatim (probed: `readonly="readonly"` survives).
 * The container element stays a real `.svelte` node.
 *
 * This is the same control-granularity boundary the Vue adapter uses (its
 * `@vue/server-renderer` has the identical coercion); the React adapter's narrow
 * on*-only boundary is not enough here. The structural envelope nodes are never
 * serialized — only the four sanctioned raw categories (control bytes, display
 * RAW, script/style chrome, behavior on* attrs) pass through `{@html}`.
 */
import type { Attrs } from '@crudui/generator-core';
declare function escAttr(s: string): string;
declare function escText(s: string): string;
/** Serialize an attr bag to ` k="v"` pairs (alphabetical order is the gate's job). */
declare function serializeAttrs(attrs: Attrs): string;
/** Serialize one void control (input). */
declare function rawVoid(tag: string, attrs: Attrs): string;
/** Serialize one container control (textarea/select) with raw inner html. */
declare function rawElement(tag: string, attrs: Attrs, innerHtml: string): string;
/** Serialize <option> markup (search/select via raw path). */
declare function rawOptions(options: Array<{
    value: string;
    label: string;
    selected: boolean;
}>, selectedAttr: 'empty' | 'selected'): string;
export { escAttr, escText, serializeAttrs, rawVoid, rawElement, rawOptions };
//# sourceMappingURL=raw.d.ts.map