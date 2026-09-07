/** Render a prepared form template with Vue SSR. */

import { bindForm, type FormTemplate } from '@crudui/generator-core';
import type { RenderFormOptions } from './index';
import { Form } from './components/Form';

/**
 * Render a compiled template to form-content HTML without a form element.
 * Throws UnsupportedFieldTypeError when a field type has no renderer.
 */
export async function renderFormSSR(
  template: FormTemplate,
  options: RenderFormOptions = {}
): Promise<string> {
  // Evaluate record values and display conditions.
  const fields = bindForm(template, options.data, options);

  // Genuine Vue 3 SSR of a REAL vnode tree (Form → Field → Widget), not a
  // createStaticVNode echo. Dynamic import keeps the SSR peer opt-in.
  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');

  const app = createSSRApp({
    render: () => Form(fields),
  });
  return renderToString(app);
}
