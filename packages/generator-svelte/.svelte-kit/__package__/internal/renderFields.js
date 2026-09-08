import { render } from 'svelte/server';
import FormFields from '../components/FormFields.svelte';
import { bindForm } from '@crudui/generator-core';
/** Render evaluated fields for layout conformance fixtures. */
export function renderFields(template, options = {}) {
    return render(FormFields, { props: { fields: bindForm(template, options.data, options) } }).body;
}
