import type { FormInstance } from '@crudui/generator-core';
/** Form template binding, rendering and list rendering. */

import { render } from 'svelte/server';
import { buildList, type BuildListOptions } from '@crudui/generator-core';
import Form from './components/Form.svelte';
import List from './components/List.svelte';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Field and widget rendering.
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { default as Field } from './components/Field.svelte';
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

export { default as Form } from './components/Form.svelte';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
