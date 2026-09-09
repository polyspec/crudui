import type { FormInstance } from '@crudui/generator-core';
/** Form template binding, rendering and list rendering. */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildList,
  type BuildListOptions,
} from '@crudui/generator-core';
import { Form } from './components/Form';
import { List } from './components/List';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Field and widget rendering.
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { Field } from './components/Field';
export { Widget } from './components/Widget';

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
export { List } from './components/List';
export { Cell } from './components/Cell';

/** Render the current form instance as HTML. */
export function renderForm(form: FormInstance): string {
  return renderToStaticMarkup(React.createElement(Form, { form }));
}

/** Options for list rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or card layout. */
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
  const element = React.createElement(List, { vm, layout }) as React.ReactElement;
  return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
}

export { Form } from './components/Form';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
