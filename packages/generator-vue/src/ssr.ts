import type { FormInstance, FormRenderOptions } from '@crudui/generator-core';
import { Form } from './components/Form';

/** Render the current form instance as the complete form (form-runtime.md, "Complete form"). */
export async function renderForm(form: FormInstance, options?: FormRenderOptions): Promise<string> {
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  return renderToString(createSSRApp({ render: () => h(Form, { form, options }) }));
}
