/**
 * CRUDUI Vue adapter — opaque-attribute raw serializer.
 *
 * Vue's `h()` SSR serializer does NOT emit string `on*` event handlers as DOM
 * attributes — an `onchange: "foo()"` prop is treated as a (non-callable) Vue
 * event listener, never a verbatim `onchange="foo()"` HTML attribute. The CRUDUI
 * behavior slot is by contract an OPAQUE verbatim passthrough (never routed
 * through the expr engine), the same category as the sanctioned
 * `<script>`/`<style>` chrome. So a control element that carries opaque `on*`
 * attributes is serialized here to a raw HTML fragment and embedded via its
 * immediate container vnode's `innerHTML` domProp (the container itself stays a
 * real vnode element).
 *
 * This is the ONLY raw-attribute path; controls with no `on*` attribute render
 * as ordinary vnodes (Vue escapes everything). Used by the widget layouts for
 * the handful of behavior-bearing fields. Mirrors the React adapter's raw.ts.
 */

import type { Attrs } from '@crudui/generator-core';

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Serialize an attribute map to ` k="v"` pairs; normalization compares order. */
export function serializeAttrs(attrs: Attrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    out += ` ${k}="${escAttr(v)}"`;
  }
  return out;
}

/** Serialize one void control (input). */
export function rawVoid(tag: string, attrs: Attrs): string {
  return `<${tag}${serializeAttrs(attrs)}>`;
}

/** Serialize one container control (textarea/select) with raw inner html. */
export function rawElement(tag: string, attrs: Attrs, innerHtml: string): string {
  return `<${tag}${serializeAttrs(attrs)}>${innerHtml}</${tag}>`;
}

/** Serialize <option> markup (search/select via raw path). */
export function rawOptions(
  options: Array<{ value: string; label: string; selected: boolean }>,
  selectedAttr: 'empty' | 'selected'
): string {
  return options
    .map((o) => {
      const sel = o.selected
        ? selectedAttr === 'selected'
          ? ' selected="selected"'
          : ' selected=""'
        : '';
      return `<option value="${escAttr(o.value)}"${sel}>${escText(o.label)}</option>`;
    })
    .join('');
}

export { escAttr, escText };
