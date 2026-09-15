import type { FormInstance } from '@crudui/generator-core';
import { Form } from './components/Form';

/** Render the current form instance as HTML. */
export async function renderForm(form: FormInstance): Promise<string> {
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  return renderToString(createSSRApp({ render: () => h(Form, { form }) }));
}
