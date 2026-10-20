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
import { patchContent } from '@polyspec/crudui-generator-core';

const subscribeNever = () => () => {};

/** The element that `ref` holds once React has mounted it; an effect runs only after the mount. */
function mounted(ref: React.RefObject<HTMLElement | null>, component: string): HTMLElement {
  if (!ref.current) throw new Error(`${component} has no mounted element`);
  return ref.current;
}

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
  React.useLayoutEffect(() => { patchContent(mounted(ref, 'RawContainer'), html); }, [html]);
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
    const element = mounted(ref, 'RawText');
    if (element.textContent !== text) element.textContent = text;
  }, [text]);
  // A passive effect runs after every layout effect of the render, when the controls are in place.
  React.useEffect(() => {
    const element = mounted(ref, 'RawText');
    if (tag !== 'script' || !clientRender) return;
    const fresh = element.ownerDocument.createElement('script');
    for (const { name, value } of Array.from(element.attributes)) fresh.setAttribute(name, value);
    fresh.textContent = element.textContent;
    element.after(fresh);
    fresh.remove();
  }, [tag, clientRender]);
  return React.createElement(tag, { ...props, ref, dangerouslySetInnerHTML: content });
}
