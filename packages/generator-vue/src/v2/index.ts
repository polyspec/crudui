/** Form template binding, rendering and list rendering. */

import type { BindFormOptions } from '@polyspec/generator-core';
import type { Language, UnsupportedMode } from '@polyspec/generator-core';
import { buildList, type BuildListOptions } from '@polyspec/generator-core';

export { ComposeLoadError } from '@polyspec/validator';
export { UnsupportedFieldTypeError } from '@polyspec/generator-core';
export { resolveDesign } from '@polyspec/generator-core';
export { evalShow, evalAppearance, makeContext } from '@polyspec/generator-core';
export { makeTranslate } from '@polyspec/generator-core';
export type { Language } from '@polyspec/generator-core';
export type { UnsupportedMode } from '@polyspec/generator-core';

// Core + components (the shared evaluation + the Vue adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@polyspec/generator-core';
export { FormV2 } from './components/FormV2';
export { fieldVNode } from './components/Field';
export { Widget } from './components/Widget';

// list-spec (read sister) — buildList view model + the Vue ListV2 adapter
// (additive; the form/write surfaces above are untouched). SPEC-V2 §9.
export { buildList } from '@polyspec/generator-core';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  ListRowVM,
  PaginationVM,
  SortVM,
  ActionVM,
  CellDisplay,
} from '@polyspec/generator-core';
export { ListV2 } from './components/ListV2';
export type { ListLayout } from './components/ListV2';

/** Options for a v2 form render. */
export interface RenderFormOptions extends Omit<BindFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}



export { renderFormV2SSR } from './ssr';

/** Options for a v2 list view-model build (re-exported shape; rows are injected). */
export type ListOptions = BuildListOptions;

/**
 * Build the `ListViewModel` for a v2 list-spec via the shared core. `rows` are
 * INJECTED display rows (no DB access); search/sort/pagination are declared only
 * (the server applies them). Throws `ComposeLoadError` on an unresolved `$ref`.
 */
export function buildListV2(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: BuildListOptions = {}
) {
  return buildList(listSpec, rows, options);
}

export { renderListV2SSR } from './listSsr';
export type { RenderListOptions } from './listSsr';

export { FormSessionView } from './components/FormSessionView';
export { compileForm, bindForm, createFormSession, createRowKey, sequenceRowKey } from '@polyspec/generator-core';
export type { FormTemplate, FormSession, FormSessionOptions } from '@polyspec/generator-core';
