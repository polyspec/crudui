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
 * `vue/server-renderer` has the identical coercion); the React adapter's narrow
 * on*-only boundary is not enough here. The structural envelope nodes are never
 * serialized — only the four sanctioned raw categories (control bytes, display
 * RAW, script/style chrome, behavior on* attrs) pass through `{@html}`.
 */

import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { patchContent, type Attrs } from '@crudui/generator-core';

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Serialize an attribute map to ` k="v"` pairs; normalization compares order. */
function serializeAttrs(attrs: Attrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    out += ` ${k}="${escAttr(v)}"`;
  }
  return out;
}

/** Serialize one void control (input). */
function rawVoid(tag: string, attrs: Attrs): string {
  return `<${tag}${serializeAttrs(attrs)}>`;
}

/** Serialize one container control (textarea/select) with raw inner html. */
function rawElement(tag: string, attrs: Attrs, innerHtml: string): string {
  return `<${tag}${serializeAttrs(attrs)}>${innerHtml}</${tag}>`;
}

/** Serialize <option> markup (search/select via raw path). */
function rawOptions(
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
 * The raw markup a container's `{@html}` writes once: server rendering writes it and hydration
 * keeps it; later markup reaches the container through the `patched` attachment.
 */
export function firstMarkup(html: () => string): string {
  return untrack(html);
}

/**
 * Patch raw markup into a container with `patchContent`, so a re-render keeps the focused
 * control, its caret and its typed order, and a script runs once, when its markup first appears.
 * A hydrated container starts with the comment Svelte writes before `{@html}` content and keeps
 * its nodes, whose scripts ran as the page was parsed. A client-rendered container holds parsed
 * content, whose scripts never run, so its markup is inserted again, which runs them.
 */
export function patched(html: string): Attachment<HTMLElement> {
  return element => {
    if (!mounted.has(element)) {
      mounted.add(element);
      if (element.firstChild?.nodeType !== Node.COMMENT_NODE) element.replaceChildren();
    }
    patchContent(element, html);
  };
}

const mounted = new WeakSet<Element>();

export { escAttr, escText, serializeAttrs, rawVoid, rawElement, rawOptions };
