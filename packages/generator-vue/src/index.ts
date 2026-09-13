/** Form template binding, rendering and list rendering. */

import { type BuildListOptions } from '@crudui/generator-core';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Node and widget rendering.
export type { NodeVM, WidgetModel } from '@crudui/generator-core';
export { nodeVNode, controlsVNode } from './components/Node';
export { Outline, outlineVNode } from './components/Outline';
export { DataView, dataVNode } from './components/DataView';
export { Widget } from './components/Widget';
export type { AnyWidget } from './components/Widget';

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
export type { ListLayout } from './components/List';

export { renderForm } from './ssr';

/** Options for a CRUDUI list view-model build (re-exported shape; rows are injected). */
export type ListOptions = BuildListOptions;


export { renderList } from './listSsr';
export type { RenderListOptions } from './listSsr';

export { Form } from './components/Form';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
