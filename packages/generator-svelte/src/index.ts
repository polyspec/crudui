/** Form template binding, rendering and list rendering. */

import { render } from 'svelte/server';
import { bindForm, buildList, type BindFormOptions, type FormTemplate, type BuildListOptions } from '@crudui/generator-core';
import type { Language, UnsupportedMode } from '@crudui/generator-core';
import Form from './components/Form.svelte';
import List from './components/List.svelte';

export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export type { Language } from '@crudui/generator-core';
export type { UnsupportedMode } from '@crudui/generator-core';

// Core + components (the shared evaluation + the Svelte adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@crudui/generator-core';
export { default as Form } from './components/Form.svelte';
export { default as Field } from './components/Field.svelte';
export { default as Widget } from './components/Widget.svelte';

// list-spec (read sister) — buildList view model + the List .svelte renderer
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
export { default as List } from './components/List.svelte';

/** Options for a CRUDUI form render. */
export interface RenderFormOptions extends Omit<BindFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /**
   * Unsupported field-type handling (default 'throw' — un-ported types are RED,
   * never silent). 'marker' emits a grep-able data-unsupported-type div instead.
   */
  unsupported?: UnsupportedMode;
}



/**
 * Strip Svelte 5 SSR scaffolding from a rendered body: the outer fragment markers
 * (`<!--[-->` / `<!--]-->`), the per-`{@html}` anchor comments, and every other
 * hydration comment. The shared normalizer also strips comments (N7); doing it
 * here keeps the RAW (pre-normalization) output a clean form-content envelope so
 * the eval/magic-token guards inspect only generator bytes.
 */
function stripSsrScaffolding(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
}

/**
 * Render a compiled template to form-content HTML without a form element.
 * Throws UnsupportedFieldTypeError when a field type has no renderer.
 */
export function renderForm(
  template: FormTemplate,
  options: RenderFormOptions = {}
): string {
  // Evaluate record values and display conditions.
  const fields = bindForm(template, options.data, options);
  // Genuine Svelte 5 SSR of a REAL .svelte tree (Form → Field → Widget), not a
  // completed-form {@html} echo.
  const { body } = render(Form, { props: { fields } });
  return stripSsrScaffolding(body);
}



/** Options for a CRUDUI list render (DB-agnostic: `rows` are the injected argument). */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or stacked-card layout. */
  mode?: 'table' | 'card';
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
export function renderList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): string {
  const { mode, ...buildOpts } = options;
  // Stages 1–4 (compose + design/expr + i18n + read cells) → markup-free model.
  const vm = buildList(listSpec, rows, buildOpts);
  // Genuine Svelte 5 SSR of a REAL .svelte tree (List), not an {@html} echo.
  const { body } = render(List, { props: { vm, mode: mode ?? 'table' } });
  return stripSsrScaffolding(body);
}

export { default as FormSessionView } from './components/FormSessionView.svelte';
export { compileForm, bindForm, createFormSession, createRowKey, sequenceRowKey } from '@crudui/generator-core';
export type { FormTemplate, FormSession, FormSessionOptions } from '@crudui/generator-core';
