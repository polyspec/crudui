/** Form template binding, rendering and list rendering. */
import { render } from 'svelte/server';
import { buildList } from '@crudui/generator-core';
import Form from './components/Form.svelte';
import List from './components/List.svelte';
export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from '@crudui/generator-core';
export { resolveDesign } from '@crudui/generator-core';
export { evalShow, evalAppearance, makeContext } from '@crudui/generator-core';
export { makeTranslate } from '@crudui/generator-core';
export { default as Field } from './components/Field.svelte';
export { default as Widget } from './components/Widget.svelte';
// list-spec (read sister) — buildList view model + the List .svelte renderer
// (additive; the form/write surfaces above are untouched). SPEC §9.
export { buildList } from '@crudui/generator-core';
export { default as List } from './components/List.svelte';
/** Render the current form instance with Svelte hydration markers intact. */
export function renderForm(form) {
    return render(Form, { props: { form } }).body;
}
/**
 * Render a CRUDUI list's CONTENT (the table/cards, no page wrapper) through Svelte 5
 * SSR — the read sister of `renderForm`. `rows` are INJECTED (DB-agnostic, SPEC
 * §9); search/sort/pagination are declared only, their real application is the
 * server's job. read-only: cells are DISPLAY values, never inputs.
 *
 * Throws `ComposeLoadError` on an unresolved `$ref` (raised by buildList before
 * any Svelte work — a load error, never a silent render).
 */
export function renderList(listSpec, rows = [], options = {}) {
    const { layout, ...buildOpts } = options;
    // Stages 1–4 (compose + design/expr + i18n + read cells) → markup-free model.
    const vm = buildList(listSpec, rows, buildOpts);
    // Genuine Svelte 5 SSR of a REAL .svelte tree (List), not an {@html} echo.
    const { body } = render(List, { props: { vm, layout: layout ?? 'table' } });
    return body;
}
export { default as Form } from './components/Form.svelte';
export { compileForm, createForm, createRowKey, sequenceRowKey } from '@crudui/generator-core';
