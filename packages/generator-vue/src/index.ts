/**
 * CRUDUI generator entry (Vue) — compose → evaluate (shared core) → vnode SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-js composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map + i18n
 *   evaluation (framework-agnostic core: @form-spec/generator-core) → (4) Vue 3
 *   vnode SSR via @vue/server-renderer renderToString.
 *
 * The evaluation runs ONCE in the shared core (buildForm returns a markup-free
 * FieldViewModel[] tree); the Vue adapter builds a real `Form` vnode tree from
 * it and serializes with renderToString. There is NO string-builder and NO
 * createStaticVNode completed-form echo — every structural node is a real vnode
 * (the leaf control bytes go through the container's innerHTML domProp because
 * @vue/server-renderer hardcodes empty/boolean attribute coercion the parity
 * fixture forbids; same boundary mechanism as React's RAW/script slots). compose
 * + expr are reused from the core (validator-js underneath); legacy generator code is
 * never touched; eval is never called.
 */

import { buildForm, type BuildFormOptions } from '@form-spec/generator-core';
import type { Language, UnsupportedMode } from '@form-spec/generator-core';

export { ComposeLoadError } from '@form-spec/validator';
export { UnsupportedFieldTypeError } from '@form-spec/generator-core';
export { resolveDesign } from '@form-spec/generator-core';
export { evalShow, evalAppearance, makeContext } from '@form-spec/generator-core';
export { makeTranslate } from '@form-spec/generator-core';
export type { Language } from '@form-spec/generator-core';
export type { UnsupportedMode } from '@form-spec/generator-core';

// Core + components (the shared evaluation + the Vue adapter surfaces).
export { buildForm } from '@form-spec/generator-core';
export type { FieldViewModel, WidgetModel } from '@form-spec/generator-core';
export { Form } from './components/Form';
export { fieldVNode } from './components/Field';
export { Widget } from './components/Widget';

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
