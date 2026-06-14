/**
 * CRUDUI generator entry (REFERENCE) — compose → evaluate (core) → JSX SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-js composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map + i18n
 *   evaluation (framework-agnostic core: ./core) → (4) JSX SSR via
 *   react-dom/server.
 *
 * The evaluation is done ONCE in the shared core (./core builds a markup-free
 * FieldViewModel tree); React renders a real `<Form>` element tree from it and
 * serializes with `renderToStaticMarkup`. There is NO string-builder and NO
 * dangerouslySetInnerHTML echo of completed HTML — every node is a JSX element
 * (the only RAW passthrough sites are the sanctioned dummy/image-viewer display
 * html and the script/style chrome). compose + expr are reused from validator-js;
 * legacy generator code is never touched; eval is never called.
 */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildForm,
  buildList,
  type BuildFormOptions,
  type BuildListOptions,
} from '@form-spec/generator-core';
import { Form } from './components/Form';
import { List } from './components/List';
import type { Language } from '@form-spec/generator-core';
import type { UnsupportedMode } from '@form-spec/generator-core';

export { ComposeLoadError } from '@form-spec/validator';
export { UnsupportedFieldTypeError } from '@form-spec/generator-core';
export { resolveDesign } from '@form-spec/generator-core';
export { evalShow, evalAppearance, makeContext } from '@form-spec/generator-core';
export { makeTranslate } from '@form-spec/generator-core';
export type { Language } from '@form-spec/generator-core';
export type { UnsupportedMode } from '@form-spec/generator-core';

// Core + components (the shared evaluation + the React adapter surfaces).
export { buildForm } from '@form-spec/generator-core';
export type { FieldViewModel, WidgetModel } from '@form-spec/generator-core';
export { Form } from './components/Form';
export { Field } from './components/Field';
export { Widget } from './components/Widget';

// list-spec (read sister) — buildList + the list/cell React surfaces (additive;
// the form surfaces above are untouched). schema §9.
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
export { List } from './components/List';
export { Cell } from './components/Cell';

/** Options for a CRUDUI form render. */
export interface RenderFormOptions extends Omit<BuildFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}

/**
 * Render a CRUDUI form's CONTENT (the field list, no `<form>` wrapper) to SSR HTML.
 * The root spec must be a group with `properties`; composition is expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent),
 * and `UnsupportedFieldTypeError` on an un-ported type (default-throw mode).
 */
export function renderForm(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const fields = buildForm(rootSpec, options);
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
