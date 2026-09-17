/**
 * CRUDUI React adapter — opaque-attribute raw serializer.
 *
 * React's SSR serializer structurally DROPS string `on*` event attributes
 * (`onchange="foo()"`) — there is no JSX path that emits them. The CRUDUI behavior
 * slot is by contract an OPAQUE verbatim passthrough (never routed through the
 * expr engine), the same category as the sanctioned `<script>`/`<style>` chrome.
 * So a control element that carries opaque `on*` attributes is serialized here to
 * a raw HTML fragment and embedded in its immediate JSX container by
 * `RawContainer` (the container itself stays a real JSX element).
 *
 * This is the ONLY raw-attribute path; controls with no `on*` attribute render as
 * ordinary JSX elements (React escapes everything). Used by the widget layouts
 * for the handful of behavior-bearing fields.
 */

import * as React from 'react';
import { patchContent, type Attrs } from '@crudui/generator-core';

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** True when an attr bag carries any opaque on-event attribute. */
export function hasEventAttr(attrs: Attrs): boolean {
  return Object.keys(attrs).some((k) => /^on[a-z]/.test(k));
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
      const sel = o.selected ? (selectedAttr === 'selected' ? ' selected="selected"' : ' selected=""') : '';
      return `<option value="${escAttr(o.value)}"${sel}>${escText(o.label)}</option>`;
    })
    .join('');
}

const subscribeNever = () => () => {};

/**
 * An element whose content is raw markup, patched into the existing nodes with `patchContent`, so
 * a re-render keeps the focused control, its caret and its typed order, and a script runs once,
 * when its markup first appears. Server rendering writes the markup and hydration keeps it; a
 * client render starts empty and inserts it.
 */
export function RawContainer({ tag = 'div', html, ...props }: { tag?: string; html: string } & Record<string, unknown>): React.ReactElement {
  const ref = React.useRef<HTMLElement>(null);
  // True on the server and while hydrating, false in a client render.
  const server = React.useSyncExternalStore(subscribeNever, () => false, () => true);
  // React sets the content again whenever this object changes, so it is created once.
  const [content] = React.useState(() => ({ __html: server ? html : '' }));
  React.useLayoutEffect(() => { patchContent(ref.current!, html); }, [html]);
  return React.createElement(tag, { ...props, ref, dangerouslySetInnerHTML: content });
}

/**
 * A `<script>` or `<style>` element with verbatim text, written once. Server rendering writes it
 * and the browser runs a server-rendered script while it parses the page; hydration keeps it. The
 * script element React creates in a client render never runs, so once the whole render is in
 * place a new script element with the same attributes and text runs next to it and is removed:
 * the script runs once, and the page keeps React's element. Later text replaces only the text.
 */
export function RawText({ tag, text, ...props }: { tag: 'script' | 'style'; text: string } & Record<string, unknown>): React.ReactElement {
  const ref = React.useRef<HTMLElement>(null);
  const server = React.useSyncExternalStore(subscribeNever, () => false, () => true);
  const [content] = React.useState(() => ({ __html: text }));
  const [clientRender] = React.useState(!server);
  React.useLayoutEffect(() => {
    if (ref.current!.textContent !== text) ref.current!.textContent = text;
  }, [text]);
  // A passive effect runs after every layout effect of the render, when the controls are in place.
  React.useEffect(() => {
    const element = ref.current!;
    if (tag !== 'script' || !clientRender) return;
    const fresh = element.ownerDocument.createElement('script');
    for (const { name, value } of Array.from(element.attributes)) fresh.setAttribute(name, value);
    fresh.textContent = element.textContent;
    element.after(fresh);
    fresh.remove();
  }, [tag, clientRender]);
  return React.createElement(tag, { ...props, ref, dangerouslySetInnerHTML: content });
}

export { escAttr, escText };
