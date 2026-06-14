/**
 * v2 generator entry (Svelte) — compose then render via Svelte 5 SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) v2 spec → (2) v2 compose (validator-js v2 compose: expand $ref/$patch
 *   into a single, composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map render
 *   (shared expr engine) → (4) SSR HTML.
 *
 * The compose engine and the expr engine are REUSED from validator-js (no
 * duplicate implementation). This module never touches v1 generator code
 * (R7 parallel run) and never calls `eval`.
 *
 * `renderFormV2` runs the v2 `FormV2.svelte` component through `svelte/server`
 * render() — the mandated Svelte 5 SSR path — then strips the SSR scaffolding
 * (the `<!--[--> … <!--]-->` fragment markers and any hydration comments) so the
 * payload is the bare form-content envelope. After the shared normalizer that
 * payload is identical to the React/Vue v2 references (3-framework parity gate,
 * tests/fixtures/v2-render).
 */

import { render } from 'svelte/server';
import type { FileLoader } from '@form-spec/validator';
import FormV2, { buildFormHtml, type FormV2Props } from './FormV2.svelte';
import type { Language } from './content';

export { ComposeLoadError } from '@form-spec/validator';
export { renderField } from './render';
export { resolveDesign } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export { makeTranslate } from './content';
export type { Language } from './content';
export { default as FormV2, buildFormHtml } from './FormV2.svelte';
export type { FormV2Props } from './FormV2.svelte';

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
 * Strip Svelte 5 SSR scaffolding from a rendered body: the outer fragment
 * markers (`<!--[-->` / `<!--]-->`) and every remaining HTML comment (component
 * hash markers, anchor comments). The `{@html}` payload itself carries no
 * comments, so this yields exactly the form-content envelope.
 */
function stripSsrScaffolding(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
}

/**
 * Render a v2 form's CONTENT (the field list, no `<form>` wrapper) through Svelte
 * 5 SSR. The root spec must be a group with `properties`; composition is
 * expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent).
 */
export function renderFormV2(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const props: FormV2Props = {
    spec: rootSpec,
    data: options.data,
    language: options.language,
    keyPrefix: options.keyPrefix,
    files: options.files,
    loader: options.loader,
    basepath: options.basepath,
  };

  // svelte/server render() runs the four stages inside the component. A
  // ComposeLoadError thrown during compose propagates out unchanged (an
  // unresolved $ref is a load error, never valid:true).
  const { body } = render(FormV2, { props });
  return stripSsrScaffolding(body);
}

/**
 * String-only renderer (no SSR scaffolding round-trip). Identical output to
 * `renderFormV2`; useful where the Svelte server runtime is not desired.
 */
export function renderFormV2String(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  return buildFormHtml({
    spec: rootSpec,
    data: options.data,
    language: options.language,
    keyPrefix: options.keyPrefix,
    files: options.files,
    loader: options.loader,
    basepath: options.basepath,
  });
}
