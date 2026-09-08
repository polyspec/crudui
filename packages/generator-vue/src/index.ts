import type { FormInstance } from '@crudui/generator-core';
/** Form template binding, rendering and list rendering. */

import { type BuildListOptions } from '@crudui/generator-core';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Core + components (the shared evaluation + the Vue adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { fieldVNode } from './components/Field';
export { Widget } from './components/Widget';

// list-spec (read sister) — buildList view model + the Vue List adapter
// (additive; the form/write surfaces above are untouched). SPEC §9.
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
export type { ListLayout } from './components/List';

export { renderForm } from './ssr';

/** Options for a CRUDUI list view-model build (re-exported shape; rows are injected). */
export type ListOptions = BuildListOptions;


export { renderList } from './listSsr';
export type { RenderListOptions } from './listSsr';

export { Form } from './components/Form';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
