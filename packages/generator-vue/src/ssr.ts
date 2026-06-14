/**
 * CRUDUI Vue 3 SSR entry — render the composed CRUDUI form through Vue's own renderer.
 *
 * The four mandated stages run in buildForm (compose → design/expr eval → i18n →
 * FieldViewModel[] tree) in the shared core; the Vue adapter (Form) builds a
 * REAL vnode tree from that view model, and @vue/server-renderer renderToString
 * serializes it. This is genuine Vue 3 SSR of a real vnode tree — NOT a
 * createStaticVNode echo of completed HTML. The leaf control bytes are injected
 * through their container vnode's `innerHTML` domProp (the only raw path, forced
 * by @vue/server-renderer's hardcoded empty/boolean attribute coercion); every
 * structural node is a real vnode.
 *
 * `vue` and `@vue/server-renderer` are imported dynamically so the package's
 * non-SSR surfaces stay usable without the SSR peer; SSR is opt-in.
 */

import { buildForm } from '@crudui/generator-core';
import type { RenderFormOptions } from './index';
import { Form } from './components/Form';

/**
 * Render a CRUDUI form to its SSR HTML string via Vue 3's server renderer.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by buildForm before
 * any Vue work — a load error, never silent), and `UnsupportedFieldTypeError` on
 * an un-ported field type (default-throw mode).
 */
export async function renderFormSSR(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): Promise<string> {
  // Stages 1–4 (compose + design/expr + i18n + tree) → markup-free view model.
  const fields = buildForm(rootSpec, options);

  // Genuine Vue 3 SSR of a REAL vnode tree (Form → Field → Widget), not a
  // createStaticVNode echo. Dynamic import keeps the SSR peer opt-in.
  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');

  const app = createSSRApp({
    render: () => Form(fields),
  });
  return renderToString(app);
}
