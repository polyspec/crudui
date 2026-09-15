# @crudui/generator-svelte

[한국어](README.ko.md).

Svelte rendering for form instances, lists and details.

```ts
import { compileForm, createForm, renderForm, renderList } from '@crudui/generator-svelte';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);

const listSpec = { columns: { name: { field: '.name', label: 'Name' } } };
const listHtml = renderList(listSpec, [{ name: 'Ada' }], { language: 'en' });
```

Render `Form` with the `form` prop. Compile once per shared template and create a form instance
per form. `renderForm(form)` returns the same markup as a string for server rendering.

`List` takes `vm` and `layout` props and `Detail` takes a `vm` prop, with models built by the
re-exported `buildList(spec, rows, options)` and `buildDetail(spec, record, options)`.
`renderList(spec, rows, options)` and `renderDetail(spec, record, options)` return strings.

The package publishes Svelte components under the `svelte` export condition. Load it through a
Svelte-aware bundler such as Vite with `@sveltejs/vite-plugin-svelte`, including on the server
(for example `ssrLoadModule`); plain Node cannot import it.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Form operations](../../docs/operations/forms.md)
- [List and detail operations](../../docs/operations/displays.md)
- [Feature status](../../docs/features.md)

Run `npm run test:forms` from the repository root to build and test all adapters.
