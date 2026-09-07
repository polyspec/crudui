/** Form template binding, rendering and list rendering. */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  bindForm,
  buildList,
  type BindFormOptions, type FormTemplate,
  type BuildListOptions,
} from '@crudui/generator-core';
import { Form } from './components/Form';
import { List } from './components/List';
import type { Language } from '@crudui/generator-core';
import type { UnsupportedMode } from '@crudui/generator-core';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Core + components (the shared evaluation + the React adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { Form } from './components/Form';
export { Field } from './components/Field';
export { Widget } from './components/Widget';

// list-spec (read sister) — buildList + the list/cell React surfaces (additive;
// the form surfaces above are untouched). schema §9.
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

/** Options for a CRUDUI form render. */
export interface RenderFormOptions extends Omit<BindFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}

/**
 * Render a compiled template to form-content HTML without a form element.
 * Throws UnsupportedFieldTypeError when a field type has no renderer.
 */
export function renderForm(
  template: FormTemplate,
  options: RenderFormOptions = {}
): string {
  const fields = bindForm(template, options.data, options);
  const element = React.createElement(Form, { fields }) as React.ReactElement;
  return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
}

/** Options for a CRUDUI list render (the read sister of RenderFormOptions). */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or card layout. */
  layout?: 'table' | 'card';
}

/**
 * Render a list spec + its INJECTED rows (SPEC §9, DB-agnostic) to SSR HTML —
 * the read sister of `renderForm`. Composes the columns map ($ref/$patch),
 * evaluates design/expression/i18n via the shared core (`buildList`), and
 * serializes the resulting `<List>` table/card tree with
 * `renderToStaticMarkup`. read-only: no input widget is emitted.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never a
 * silent render).
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

export { FormSessionView } from './components/FormSessionView';
export { compileForm, bindForm, createFormSession, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormSession, FormSessionOptions } from '@crudui/generator-core';
