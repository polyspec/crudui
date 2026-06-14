/**
 * CRUDUI generator entry (Svelte) — compose then render via Svelte 5 SSR.
 *
 * Pipeline (the four mandated stages, SPEC §2 / G5):
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-js CRUDUI compose: expand $ref/$patch
 *   into a single, composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, NOT a render) → (3) design-slot + condition-map render
 *   (shared expr engine) → (4) SSR HTML.
 *
 * The compose engine and the expr engine are REUSED from validator-js (no
 * duplicate implementation). This module never touches legacy generator code
 * (R7 parallel run) and never calls `eval`.
 *
 * `renderForm` runs the CRUDUI `Form.svelte` component through `svelte/server`
 * render() — the mandated Svelte 5 SSR path — then strips the SSR scaffolding
 * (the `<!--[--> … <!--]-->` fragment markers and any hydration comments) so the
 * payload is the bare form-content envelope. After the shared normalizer that
 * payload is identical to the React/Vue CRUDUI references (3-framework parity gate,
 * tests/fixtures/form-render).
 */

import { render } from 'svelte/server';
import type { FileLoader } from '@form-spec/validator';
import Form, { buildFormHtml, type FormProps } from './Form.svelte';
import type { Language } from './content';

export { ComposeLoadError } from '@form-spec/validator';
export { renderField } from './render';
export { resolveDesign } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export { makeTranslate } from './content';
export type { Language } from './content';
export { default as Form, buildFormHtml } from './Form.svelte';
export type { FormProps } from './Form.svelte';

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
 * Render a CRUDUI form's CONTENT (the field list, no `<form>` wrapper) through Svelte
 * 5 SSR. The root spec must be a group with `properties`; composition is
 * expanded first.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (a load error, never silent).
 */
export function renderForm(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): string {
  const props: FormProps = {
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
  const { body } = render(Form, { props });
  return stripSsrScaffolding(body);
}

/**
 * String-only renderer (no SSR scaffolding round-trip). Identical output to
 * `renderForm`; useful where the Svelte server runtime is not desired.
 */
export function renderFormString(
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
