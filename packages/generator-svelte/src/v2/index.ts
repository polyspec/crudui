/** Form template binding, rendering and list rendering. */

import { render } from 'svelte/server';
import { bindForm, buildList, type BindFormOptions, type FormTemplate, type BuildListOptions } from '@polyspec/generator-core';
import type { Language, UnsupportedMode } from '@polyspec/generator-core';
import FormV2 from './components/FormV2.svelte';
import ListV2 from './components/ListV2.svelte';

export { ComposeLoadError } from '@polyspec/validator';
export { UnsupportedFieldTypeError } from '@polyspec/generator-core';
export { resolveDesign } from '@polyspec/generator-core';
export { evalShow, evalAppearance, makeContext } from '@polyspec/generator-core';
export { makeTranslate } from '@polyspec/generator-core';
export type { Language } from '@polyspec/generator-core';
export type { UnsupportedMode } from '@polyspec/generator-core';

// Core + components (the shared evaluation + the Svelte adapter surfaces).
export type { FieldViewModel, WidgetModel } from '@polyspec/generator-core';
export { default as FormV2 } from './components/FormV2.svelte';
export { default as Field } from './components/Field.svelte';
export { default as Widget } from './components/Widget.svelte';

// list-spec (read sister) — buildList view model + the ListV2 .svelte renderer
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
export { default as ListV2 } from './components/ListV2.svelte';

/** Options for a v2 form render. */
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
export function renderFormV2(
  template: FormTemplate,
  options: RenderFormOptions = {}
): string {
  // Evaluate record values and display conditions.
  const fields = bindForm(template, options.data, options);
  // Genuine Svelte 5 SSR of a REAL .svelte tree (FormV2 → Field → Widget), not a
  // completed-form {@html} echo.
  const { body } = render(FormV2, { props: { fields } });
  return stripSsrScaffolding(body);
}



/** Options for a v2 list render (DB-agnostic: `rows` are the injected argument). */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or stacked-card layout. */
  mode?: 'table' | 'card';
}

/**
 * Render a v2 list's CONTENT (the table/cards, no page wrapper) through Svelte 5
 * SSR — the read sister of `renderFormV2`. `rows` are INJECTED (DB-agnostic, SPEC
 * §9); search/sort/pagination are declared only, their real application is the
 * server's job. read-only: cells are DISPLAY values, never inputs.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by buildList before
 * any Svelte work — a load error, never a silent render).
 */
export function renderListV2(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): string {
  const { mode, ...buildOpts } = options;
  // Stages 1–4 (compose + design/expr + i18n + read cells) → markup-free model.
  const vm = buildList(listSpec, rows, buildOpts);
  // Genuine Svelte 5 SSR of a REAL .svelte tree (ListV2), not an {@html} echo.
  const { body } = render(ListV2, { props: { vm, mode: mode ?? 'table' } });
  return stripSsrScaffolding(body);
}

export { default as FormSessionView } from './components/FormSessionView.svelte';
export { compileForm, bindForm, createFormSession, createRowKey, sequenceRowKey } from '@polyspec/generator-core';
export type { FormTemplate, FormSession, FormSessionOptions } from '@polyspec/generator-core';
