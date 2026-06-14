/**
 * v2 generator entry (REFERENCE) — compose → evaluate (core) → JSX SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) v2 spec → (2) v2 compose (validator-js composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map + i18n
 *   evaluation (framework-agnostic core: ./core) → (4) JSX SSR via
 *   react-dom/server.
 *
 * The evaluation is done ONCE in the shared core (./core builds a markup-free
 * FieldViewModel tree); React renders a real `<FormV2>` element tree from it and
 * serializes with `renderToStaticMarkup`. There is NO string-builder and NO
 * dangerouslySetInnerHTML echo of completed HTML — every node is a JSX element
 * (the only RAW passthrough sites are the sanctioned dummy/image-viewer display
 * html and the script/style chrome). compose + expr are reused from validator-js;
 * v1 generator code is never touched; eval is never called.
 */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildForm, type BuildFormOptions } from '@form-spec/generator-core';
import { FormV2 } from './components/FormV2';
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
export { FormV2 } from './components/FormV2';
export { Field } from './components/Field';
export { Widget } from './components/Widget';

/** Options for a v2 form render. */
export interface RenderFormOptions extends Omit<BuildFormOptions, 'language' | 'unsupported'> {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}

/**
 * Render a v2 form's CONTENT (the field list, no `<form>` wrapper) to SSR HTML.
 * The root spec must be a group with `properties`; composition is expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent),
 * and `UnsupportedFieldTypeError` on an un-ported type (default-throw mode).
 */
export function renderFormV2(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const fields = buildForm(rootSpec, options);
  const element = React.createElement(FormV2, { fields }) as React.ReactElement;
  return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
}
