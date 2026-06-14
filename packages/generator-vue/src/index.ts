/**
 * CRUDUI generator entry (Vue) — compose → evaluate (shared core) → vnode SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-ts composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map + i18n
 *   evaluation (framework-agnostic core: @crudui/generator-core) → (4) Vue 3
 *   vnode SSR via @vue/server-renderer renderToString.
 *
 * The evaluation runs ONCE in the shared core (buildForm returns a markup-free
 * FieldViewModel[] tree); the Vue adapter builds a real `Form` vnode tree from
 * it and serializes with renderToString. There is NO string-builder and NO
 * createStaticVNode completed-form echo — every structural node is a real vnode
 * (the leaf control bytes go through the container's innerHTML domProp because
 * @vue/server-renderer hardcodes empty/boolean attribute coercion the parity
 * fixture forbids; same boundary mechanism as React's RAW/script slots). compose
 * + expr are reused from the core (validator-ts underneath); legacy generator code is
 * never touched; eval is never called.
 */

import { buildForm, type BuildFormOptions } from '@crudui/generator-core';
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
export { buildForm } from '@crudui/generator-core';
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
export interface RenderFormOptions extends Omit<BuildFormOptions, 'language' | 'unsupported'> {
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
