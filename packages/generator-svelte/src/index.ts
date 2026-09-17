/**
 * Svelte components and server rendering for CRUDUI forms, lists and details. Applications
 * compile and create forms with `@crudui/generator-core`.
 */

import { render } from 'svelte/server';
import { buildList, buildDetail, type BuildListOptions, type BuildDetailOptions, type FormInstance } from '@crudui/generator-core';
import { listLayout } from '@crudui/generator-core/internal';
import Form from './components/Form.svelte';
import List from './components/List.svelte';
import Detail from './components/Detail.svelte';

// Node, widget, structure map and data view rendering.
export { default as Node } from './components/Node.svelte';
export { default as Controls } from './components/Controls.svelte';
export { default as Outline } from './components/Outline.svelte';
export { default as OutlineView } from './components/OutlineView.svelte';
export { default as DataView } from './components/DataView.svelte';
export { default as DataPanel } from './components/DataPanel.svelte';
export { default as Widget } from './components/Widget.svelte';

// Form, list and detail rendering.
export { default as Form } from './components/Form.svelte';
export { default as List } from './components/List.svelte';
export { default as Detail } from './components/Detail.svelte';

/** Render the current form instance with Svelte hydration markers intact. */
export function renderForm(form: FormInstance): string {
  return render(Form, { props: { form } }).body;
}

/** Options for list rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or stacked-card layout. */
  layout?: 'table' | 'card';
}

/**
 * Compose a list specification, evaluate supplied rows and render list HTML.
 * Throws `ComposeLoadError` when a composition reference cannot be resolved.
 */
export function renderList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): string {
  // The whole options reach the model, whose input text check reads the layout too.
  const { layout } = options;
  const vm = buildList(listSpec, rows, options);
  const { body } = render(List, { props: { vm, layout: listLayout(layout) } });
  return body;
}

/** Compose, evaluate and render one read-only detail without data access. */
export function renderDetail(
  detailSpec: Record<string, unknown>,
  record: Record<string, unknown> = {},
  options: BuildDetailOptions = {},
): string {
  const vm = buildDetail(detailSpec, record, options);
  return render(Detail, { props: { vm } }).body;
}
