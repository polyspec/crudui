import { render } from 'svelte/server';
import FormFields from '../components/FormFields.svelte';
import { bindForm, type FormTemplate, type BindFormOptions } from '@crudui/generator-core';

/** Render evaluated fields for layout conformance fixtures. */
export function renderFields(template: FormTemplate, options: BindFormOptions & { data?: Record<string, unknown> } = {}): string {
  return render(FormFields, { props: { fields: bindForm(template, options.data, options) } }).body;
}
