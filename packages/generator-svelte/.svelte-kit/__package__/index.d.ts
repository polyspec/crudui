import type { FormInstance } from '@crudui/generator-core';
import { type BuildListOptions } from '@crudui/generator-core';
export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { default as Field } from './components/Field.svelte';
export { default as Widget } from './components/Widget.svelte';
export { buildList } from '@crudui/generator-core';
export type { ListViewModel, ColumnVM, CellVM, ListRowVM, PaginationVM, SortVM, ActionVM, CellDisplay, } from '@crudui/generator-core';
export { default as List } from './components/List.svelte';
/** Render the current form instance with Svelte hydration markers intact. */
export declare function renderForm(form: FormInstance): string;
/** Options for a CRUDUI list render (DB-agnostic: `rows` are the injected argument). */
export interface RenderListOptions extends BuildListOptions {
    /** Table (default) or stacked-card layout. */
    layout?: 'table' | 'card';
}
/**
 * Render a CRUDUI list's CONTENT (the table/cards, no page wrapper) through Svelte 5
 * SSR — the read sister of `renderForm`. `rows` are INJECTED (DB-agnostic, SPEC
 * §9); search/sort/pagination are declared only, their real application is the
 * server's job. read-only: cells are DISPLAY values, never inputs.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by buildList before
 * any Svelte work — a load error, never a silent render).
 */
export declare function renderList(listSpec: Record<string, unknown>, rows?: Array<Record<string, unknown>>, options?: RenderListOptions): string;
export { default as Form } from './components/Form.svelte';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormInstance, CreateFormOptions } from '@crudui/generator-core';
//# sourceMappingURL=index.d.ts.map