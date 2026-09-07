/** Form template binding, rendering and list rendering. */

import type { BindFormOptions } from '@crudui/generator-core';
import type { Language, UnsupportedMode } from '@crudui/generator-core';
import { buildList, type BuildListOptions } from '@crudui/generator-core';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Core + components (the shared evaluation + the Vue adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { Form } from './components/Form';
export { fieldVNode } from './components/Field';
export { Widget } from './components/Widget';

// list-spec (read sister) — buildList view model + the Vue List adapter
// (additive; the form/write surfaces above are untouched). schema §9.
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

/** Options for a CRUDUI form render. */
export interface RenderFormOptions extends Omit<BindFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}



export { renderFormSSR } from './ssr';

/** Options for a CRUDUI list view-model build (re-exported shape; rows are injected). */
export type ListOptions = BuildListOptions;

/**
 * Build the `ListViewModel` for a CRUDUI list-spec via the shared core. `rows` are
 * INJECTED display rows (no DB access); search/sort/pagination are declared only
 * (the server applies them). Throws `ComposeLoadError` on an unresolved `$ref`.
 */


export { renderListSSR } from './listSsr';
export type { RenderListOptions } from './listSsr';

export { FormSessionView } from './components/FormSessionView';
export { compileForm, bindForm, createFormSession, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormSession, FormSessionOptions } from '@crudui/generator-core';
