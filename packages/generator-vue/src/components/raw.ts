/**
 * CRUDUI Vue adapter — opaque-attribute raw serializer.
 *
 * Vue's `h()` SSR serializer does NOT emit string `on*` event handlers as DOM
 * attributes — an `onchange: "foo()"` prop is treated as a (non-callable) Vue
 * event listener, never a verbatim `onchange="foo()"` HTML attribute. The CRUDUI
 * behavior slot is by contract an OPAQUE verbatim passthrough (never routed
 * through the expr engine), the same category as the sanctioned
 * `<script>`/`<style>` chrome. So a control element that carries opaque `on*`
 * attributes is serialized here to a raw HTML fragment and embedded in its
 * immediate container vnode by `rawContainer` (the container itself stays a
 * real vnode element).
 *
 * This is the ONLY raw-attribute path; controls with no `on*` attribute render
 * as ordinary vnodes (Vue escapes everything). Used by the widget layouts for
 * the handful of behavior-bearing fields. Mirrors the React adapter's raw.ts.
 */

import { h, withDirectives, type ObjectDirective, type VNode } from 'vue';
import { patchContent, type Attrs } from '@crudui/generator-core';

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

/**
 * Raw markup of a container. Server rendering writes it as the container's content; in the
 * browser it is patched into the existing nodes with `patchContent`, so a re-render keeps the
 * focused control, its caret and its typed order, and a script runs once, when its markup first
 * appears.
 */
const markup: ObjectDirective<Element, string> = {
  getSSRProps: ({ value }) => ({ innerHTML: value }),
  // A hydrated container already holds the markup; a new one receives it, and its scripts run.
  beforeMount: (element, { value }) => patchContent(element, value),
  beforeUpdate: (element, { value, oldValue }) => {
    if (value !== oldValue) patchContent(element, value);
  },
};

/** A real container vnode whose content is raw markup. */
export function rawContainer(tag: string, props: Record<string, unknown>, html: string): VNode {
  return withDirectives(h(tag, props), [[markup, html]]);
}

export { escAttr, escText };
