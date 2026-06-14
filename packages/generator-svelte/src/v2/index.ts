/**
 * v2 generator entry (Svelte) — compose → evaluate (shared core) → .svelte SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) v2 spec → (2) v2 compose (validator-js composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map + i18n
 *   evaluation (framework-agnostic core: @form-spec/generator-core) → (4) Svelte
 *   5 SSR via svelte/server render().
 *
 * The evaluation runs ONCE in the shared core (buildForm returns a markup-free
 * FieldViewModel[] tree); the Svelte adapter builds a real `FormV2.svelte`
 * element tree from it and serializes with svelte/server render(). There is NO
 * string-builder and NO completed-form `{@html}` echo — every structural node is
 * a real `.svelte` element (the leaf control bytes go through the container's
 * `{@html}` directive because svelte/server coerces empty/boolean attributes the
 * parity fixture forbids; the same control-granularity boundary the Vue adapter
 * uses). compose + expr are reused from the core (validator-js underneath); v1
 * generator code is never touched; eval is never called.
 */

import { render } from 'svelte/server';
import { buildForm, buildList, type BuildFormOptions, type BuildListOptions } from '@form-spec/generator-core';
import type { Language, UnsupportedMode } from '@form-spec/generator-core';
import FormV2 from './components/FormV2.svelte';
import ListV2 from './components/ListV2.svelte';

export { ComposeLoadError } from '@form-spec/validator';
export { UnsupportedFieldTypeError } from '@form-spec/generator-core';
export { resolveDesign } from '@form-spec/generator-core';
export { evalShow, evalAppearance, makeContext } from '@form-spec/generator-core';
export { makeTranslate } from '@form-spec/generator-core';
export type { Language } from '@form-spec/generator-core';
export type { UnsupportedMode } from '@form-spec/generator-core';

// Core + components (the shared evaluation + the Svelte adapter surfaces).
export { buildForm } from '@form-spec/generator-core';
export type { FieldViewModel, WidgetModel } from '@form-spec/generator-core';
export { default as FormV2 } from './components/FormV2.svelte';
export { default as Field } from './components/Field.svelte';
export { default as Widget } from './components/Widget.svelte';

// list-spec (read sister) — buildList view model + the ListV2 .svelte renderer
// (additive; the form/write surfaces above are untouched). SPEC-V2 §9.
export { buildList } from '@form-spec/generator-core';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  ListRowVM,
  PaginationVM,
  SortVM,
  ActionVM,
  CellDisplay,
} from '@form-spec/generator-core';
export { default as ListV2 } from './components/ListV2.svelte';

/** Options for a v2 form render. */
export interface RenderFormOptions extends Omit<BuildFormOptions, 'language' | 'unsupported'> {
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
 * Build the top-level `FieldViewModel[]` for a v2 form via the shared core. The
 * root spec must be a group with `properties`; composition is expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent),
 * and `UnsupportedFieldTypeError` on an un-ported type (default-throw mode).
 */
export function buildFormV2(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
) {
  return buildForm(rootSpec, options);
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
 * Render a v2 form's CONTENT (the field list, no `<form>` wrapper) through Svelte
 * 5 SSR. The root spec must be a group with `properties`; composition is expanded
 * first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by buildForm before
 * any Svelte work — a load error, never silent), and `UnsupportedFieldTypeError`
 * on an un-ported field type (default-throw mode).
 */
export function renderFormV2(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  // Stages 1–4 (compose + design/expr + i18n + tree) → markup-free view model.
  const fields = buildForm(rootSpec, options);
  // Genuine Svelte 5 SSR of a REAL .svelte tree (FormV2 → Field → Widget), not a
  // completed-form {@html} echo.
  const { body } = render(FormV2, { props: { fields } });
  return stripSsrScaffolding(body);
}

/**
 * String alias of `renderFormV2` (kept as a public export for callers that hold
 * the older name). Svelte's render() is synchronous, so there is no separate
 * string path — both go through buildForm → svelte/server render() and yield the
 * identical envelope.
 */
export function renderFormV2String(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  return renderFormV2(rootSpec, options);
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
