import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { FormFields } from '../components/FormFields';
import { bindForm, type FormTemplate, type BindFormOptions } from '@crudui/generator-core';

/** Render evaluated fields for layout conformance fixtures. */
export async function renderFields(template: FormTemplate, options: BindFormOptions & { data?: Record<string, unknown> } = {}): Promise<string> {
  return renderToString(createSSRApp({ render: () => FormFields(bindForm(template, options.data, options)) }));
}
