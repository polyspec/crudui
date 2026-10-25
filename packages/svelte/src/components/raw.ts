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
import { patchContent } from '@polyspec/crudui-generator-core';

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
    // The options of each select that its markup marks selected and that are selected, before the patch.
    const selected = Array.from(element.querySelectorAll('select'), select => (
      { select, options: Array.from(select.selectedOptions).filter(option => option.hasAttribute('selected')) }));
    patchContent(element, html);
    for (const { select, options } of selected) keepMarkedSelection(select, options);
  };
}

/**
 * Select the options of a patched select that its markup marks `selected` when the patch removed
 * the mark of a selected option, or the option itself, such as the choice of a removed source row
 * (docs/spec/schema.md, CUSC-071): the browser then keeps that option selected under another value
 * or selects the first option, a value the data does not hold. A single select whose markup marks
 * no option selects none. The patch runs after the form synchronized its controls for the same
 * data, so the markup is the selection of the data.
 */
function keepMarkedSelection(select: HTMLSelectElement, before: HTMLOptionElement[]): void {
  if (before.every(option => select.contains(option) && option.hasAttribute('selected'))) return;
  // The mark is read from the attribute: a single select re-selects an option whose selectedness
  // is set to false when no other option is selected.
  const marked = Array.from(select.options).filter(option => option.hasAttribute('selected'));
  if (!select.multiple && marked.length === 0) {
    select.selectedIndex = -1;
    return;
  }
  for (const option of select.options) option.selected = marked.includes(option);
}

const mounted = new WeakSet<Element>();
