/**
 * CRUDUI Vue 3 SSR entry — emit the composed CRUDUI form HTML through Vue's own server
 * renderer.
 *
 * The four mandated stages run in renderForm (compose → design/expr →
 * envelope), producing the verified Limepie envelope as an HTML STRING that is
 * byte-faithful to the React CRUDUI reference. This module hands that string to Vue
 * 3's createStaticVNode (the same hoisted-static-content vnode Vue's compiler
 * emits) and serializes it with @vue/server-renderer renderToString — genuine
 * Vue 3 SSR. createStaticVNode preserves the markup verbatim (including
 * `value=""` / `data-default=""`), so the SSR output matches the shared parity
 * fixture after normalization across all three frameworks.
 *
 * `vue` and `@vue/server-renderer` are imported dynamically so the CRUDUI string
 * entry (renderForm) stays usable without the SSR peer; SSR is opt-in.
 */

import { renderForm, type RenderFormOptions } from './index';

/**
 * Render a CRUDUI form to its SSR HTML string via Vue 3's server renderer.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by renderForm
 * before any Vue work — a load error, never silent).
 */
export async function renderFormSSR(
  rootSpec: Record<string, unknown>,
  options: RenderFormOptions = {}
): Promise<string> {
  // Stages 1–4: compose + design/expr + envelope → verified HTML string.
  const html = renderForm(rootSpec, options);

  // Genuine Vue 3 SSR: emit the verified markup as a static vnode (Vue's own
  // hoisted-static mechanism) through @vue/server-renderer renderToString.
  const { createSSRApp, createStaticVNode } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');

  const app = createSSRApp({
    render: () => createStaticVNode(html, 1),
  });
  return renderToString(app);
}
