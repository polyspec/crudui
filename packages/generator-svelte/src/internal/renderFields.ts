import { render } from 'svelte/server';
import FormFields from '../components/FormFields.svelte';
import { bindButtons, bindForm, formMessages, type FormTemplate, type BindFormOptions } from '@crudui/generator-core';

/** Render evaluated fields for layout conformance fixtures. */
export function renderFields(template: FormTemplate, options: BindFormOptions & { data?: Record<string, unknown> } = {}): string {
  return render(FormFields, { props: {
    fields: bindForm(template, options.data, options),
    buttons: bindButtons(template, options.data, options),
    messages: formMessages(options.language ?? 'ko'),
  } }).body;
}
