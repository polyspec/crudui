/**
 * v2 generator entry (Vue) — compose then render.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) v2 spec → (2) v2 compose (validator-js v2 compose: expand $ref/$patch
 *   into a single, composition-free spec; an unresolved $ref is a ComposeLoadError,
 *   NOT a render) → (3) design-slot + condition-map render (shared expr engine) →
 *   (4) SSR HTML.
 *
 * The compose engine and the expr engine are REUSED from validator-js (no
 * duplicate implementation). This module never touches v1 generator code
 * (R7 parallel run) and never calls `eval`.
 *
 * `renderFormV2` returns the field-list HTML STRING (byte-faithful to the React
 * v2 reference). `renderFormV2SSR` (ssr.ts) emits that exact string through Vue
 * 3's @vue/server-renderer renderToString — genuine Vue 3 SSR.
 */

import {
  composeProperties,
  MemoryLoader,
  ComposeLoadError,
  type FileLoader,
} from '@form-spec/validator';
import { makeTranslate, type Language } from './content';
import { renderField, type RenderState } from './render';
import { resetUniqid } from './util';

export { ComposeLoadError } from '@form-spec/validator';
export { renderField } from './render';
export { resolveDesign } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export { makeTranslate } from './content';
export type { Language } from './content';

/** Options for a v2 form render. */
export interface RenderFormOptions {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Name/id prefix. */
  keyPrefix?: string;
  /** $ref file set for composition (virtual in-memory loader). */
  files?: Record<string, Record<string, unknown>>;
  /** A custom loader (overrides `files`). */
  loader?: FileLoader;
  /** Basepath for relative $ref. */
  basepath?: string;
}

/**
 * Render a v2 form's CONTENT (the field list, no `<form>` wrapper) to an HTML
 * STRING. The root spec must be a group with `properties`; composition is
 * expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent).
 */
export function renderFormV2(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const data = options.data ?? {};
  const t = makeTranslate(options.language ?? 'ko');
  const loader = options.loader ?? new MemoryLoader(options.files ?? {});
  const opts = options.basepath ? { basepath: options.basepath } : {};

  resetUniqid();

  // Stage 2: compose the root properties (recurses into nested $ref/$patch).
  const rawProps = (rootSpec.properties as Record<string, unknown>) ?? {};
  const props = composeProperties(rawProps, loader, opts);

  const state: RenderState = { data, keyPrefix: options.keyPrefix, t };

  // Stages 3–4: render each composed top-level field.
  let fieldsHtml = '';
  for (const [name, fieldSpec] of Object.entries(props)) {
    if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
      fieldsHtml += renderField(name, fieldSpec as Record<string, unknown>, name, state);
    }
  }
  return `<div class="form-group">${fieldsHtml}</div>`;
}

export { renderFormV2SSR } from './ssr';
