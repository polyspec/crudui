/** List HTML rendering with Vue's server renderer. */

import { buildList, type BuildListOptions } from '@crudui/generator-core';
import { listLayout } from '@crudui/generator-core/internal';
import { List, type ListLayout } from './components/List';

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
  // The whole options reach the model, whose input text check reads the layout too.
  const { layout } = options;
  const vm = buildList(listSpec, rows, options);
  const layoutName = listLayout(layout);

  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');

  const app = createSSRApp({
    render: () => List(vm, layoutName),
  });
  return renderToString(app);
}
