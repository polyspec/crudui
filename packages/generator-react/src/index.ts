/**
 * CRUDUI generator entry (REFERENCE) — compose then render.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-js CRUDUI compose: expand $ref/$patch
 *   into a single, composition-free spec; an unresolved $ref is a ComposeLoadError,
 *   NOT a render) → (3) design-slot + condition-map render (shared expr engine) →
 *   (4) SSR HTML.
 *
 * The compose engine and the expr engine are REUSED from validator-js (no
 * duplicate implementation). This module never touches legacy generator code
 * (R7 parallel run) and never calls `eval`.
 */

import {
  composeProperties,
  MemoryLoader,
  ComposeLoadError,
  type FileLoader,
} from '@form-spec/validator';
import { makeTranslate, type Language } from './content';
import { renderField, type RenderState, type UnsupportedMode } from './render';

export { ComposeLoadError } from '@form-spec/validator';
export { UnsupportedFieldTypeError } from './errors';
export { renderField } from './render';
export { resolveDesign } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export { makeTranslate } from './content';
export type { Language } from './content';
export type { UnsupportedMode } from './render';

/** Options for a CRUDUI form render. */
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
  /**
   * Unsupported field-type handling (default 'throw' — un-ported types are RED,
   * never silent). 'marker' emits a grep-able data-unsupported-type div instead.
   */
  unsupported?: UnsupportedMode;
}

/**
 * Render a CRUDUI form's CONTENT (the field list, no `<form>` wrapper). The root
 * spec must be a group with `properties`; composition is expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent).
 */
export function renderForm(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const data = options.data ?? {};
  const t = makeTranslate(options.language ?? 'ko');
  const loader = options.loader ?? new MemoryLoader(options.files ?? {});
  const opts = options.basepath ? { basepath: options.basepath } : {};

  // Stage 2: compose the root properties (recurses into nested $ref/$patch).
  const rawProps = (rootSpec.properties as Record<string, unknown>) ?? {};
  const props = composeProperties(rawProps, loader, opts);

  const state: RenderState = {
    data,
    keyPrefix: options.keyPrefix,
    t,
    unsupported: options.unsupported ?? 'throw',
  };

  // Stages 3–4: render each composed top-level field.
  let fieldsHtml = '';
  for (const [name, fieldSpec] of Object.entries(props)) {
    if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
      fieldsHtml += renderField(name, fieldSpec as Record<string, unknown>, name, state);
    }
  }
  return `<div class="form-group">${fieldsHtml}</div>`;
}
