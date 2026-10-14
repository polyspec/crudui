import { render } from 'svelte/server';
import FormFields from '../components/FormFields.svelte';
import { bindButtons, bindForm, formDescription, formMessages, type FormTemplate, type BindFormOptions } from '@polyspec/crudui-generator-core';

/** Render evaluated fields for layout conformance fixtures. */
export function renderFields(template: FormTemplate, options: BindFormOptions & { data?: Record<string, unknown> } = {}): string {
  return render(FormFields, { props: {
    fields: bindForm(template, options.data, options),
    buttons: bindButtons(template, options.data, options),
    messages: formMessages(options.language ?? 'ko'),
    description: formDescription(template, { language: options.language ?? 'ko' }),
  } }).body;
}
