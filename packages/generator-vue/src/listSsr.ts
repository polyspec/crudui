/**
 * CRUDUI Vue list SSR entry — render a composed list-spec through Vue's own renderer.
 *
 * The read sister of ssr.ts (form SSR). The four stages run in buildList (compose
 * the columns map → design/condition-map eval → i18n → cell render) in the shared
 * core; the Vue adapter (List) builds a REAL vnode tree (table/cards) from that
 * `ListViewModel`, and @vue/server-renderer renderToString serializes it. Genuine
 * Vue 3 SSR of a real vnode tree — read-only, NO input/form element emitted, no DB
 * access (rows are injected). The only raw innerHTML paths are the two sanctioned
 * verbatim boundaries: a `html`-format cell and an action's opaque behavior chrome.
 *
 * `vue` and `@vue/server-renderer` are imported dynamically so the package's
 * non-SSR surfaces stay usable without the SSR peer; SSR is opt-in.
 */

import { buildList, type BuildListOptions } from '@form-spec/generator-core';
import { List, type ListLayout } from './components/List';

/** Options for a CRUDUI list SSR render. */
export interface RenderListOptions extends BuildListOptions {
  /** Layout: a default `<table>` or a card grid (default 'table'). */
  layout?: ListLayout;
}

/**
 * Render a CRUDUI list-spec to its SSR HTML string via Vue 3's server renderer.
 * `rows` are injected (the display rows; no DB access). Throws `ComposeLoadError`
 * on an unresolved `$ref` (raised by buildList before any Vue work — a load error,
 * never silent).
 */
export async function renderListSSR(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): Promise<string> {
  // Stages 1–4 (compose + design/condition-map + i18n + cell render) → view model.
  const { layout, ...buildOpts } = options;
  const vm = buildList(listSpec, rows, buildOpts);

  // Genuine Vue 3 SSR of a REAL vnode tree (List → table/cards → cells).
  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');

  const app = createSSRApp({
    render: () => List(vm, layout ?? 'table'),
  });
  return renderToString(app);
}
