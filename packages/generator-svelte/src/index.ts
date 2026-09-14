import type { FormInstance } from '@crudui/generator-core';
/** Form template binding, rendering and list rendering. */

import { render } from 'svelte/server';
import { buildList, buildDetail, type BuildListOptions, type BuildDetailOptions } from '@crudui/generator-core';
import Form from './components/Form.svelte';
import List from './components/List.svelte';
import Detail from './components/Detail.svelte';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Node and widget rendering.
export type { NodeVM, WidgetModel } from '@crudui/generator-core';
export { default as Node } from './components/Node.svelte';
export { default as Controls } from './components/Controls.svelte';
export { default as Outline } from './components/Outline.svelte';
export { default as OutlineView } from './components/OutlineView.svelte';
export { default as DataView } from './components/DataView.svelte';
export { default as DataPanel } from './components/DataPanel.svelte';
export { default as Widget } from './components/Widget.svelte';

// List models and rendering.
export { buildList } from '@crudui/generator-core';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  ListRowVM,
  PaginationVM,
  SortVM,
  ActionVM,
  CellDisplay,
} from '@crudui/generator-core';
export { default as List } from './components/List.svelte';
export { default as Detail } from './components/Detail.svelte';
export { buildDetail } from '@crudui/generator-core';
export type { DetailViewModel, DetailFieldVM, BuildDetailOptions } from '@crudui/generator-core';

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
  const { layout, ...buildOpts } = options;
  const vm = buildList(listSpec, rows, buildOpts);
  const { body } = render(List, { props: { vm, layout: layout ?? 'table' } });
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

export { default as Form } from './components/Form.svelte';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
