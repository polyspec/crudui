/** List HTML rendering with Vue's server renderer. */

import { type BuildListOptions } from '@polyspec/crudui-generator-core';
import { buildListLayout } from '@polyspec/crudui-generator-core/internal';
import { List, type ListLayout } from './components/List.js';

/** Options for a CRUDUI list SSR render. */
export interface RenderListOptions extends BuildListOptions {
  /** Layout: a default `<table>` or a card grid (default 'table'). */
  layout?: ListLayout;
}

/**
 * Compose a list specification, evaluate supplied rows and render list HTML.
 * Throws `ComposeLoadError` when a composition reference cannot be resolved.
 */
export async function renderList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): Promise<string> {
  const { vm, layout: layoutName } = buildListLayout(listSpec, rows, options);

  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');

  const app = createSSRApp({
    render: () => List(vm, layoutName),
  });
  return renderToString(app);
}
