# @crudui/generator-vue

[한국어](README.ko.md).

Vue rendering for form instances, lists and details.

```ts
import { h } from 'vue';
import { buildList, compileForm, createForm } from '@crudui/generator-core';
import { Form, List, renderForm, renderList } from '@crudui/generator-vue';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = await renderForm(form);
const vnode = h(Form, { form });

const listSpec = { columns: { name: { field: 'name', label: 'Name' } } };
const rows = [{ name: 'Ada' }];
const listHtml = await renderList(listSpec, rows, { language: 'en' });
const list = List(buildList(listSpec, rows, { language: 'en' }), 'table');
```

Render `Form` with the `form` prop. Compile once per shared template and create a form instance
per form. `renderForm(form)` returns a promise of the same markup for server rendering.

`List(vm, layout)` and `Detail(vm)` return VNodes for models built with `buildList(spec, rows, options)`
and `buildDetail(spec, record, options)` of `@crudui/generator-core`.
`renderList(spec, rows, options)` and `renderDetail(spec, record, options)` return promises of
strings. Server rendering uses `vue/server-renderer`, which the `vue` peer dependency provides.

The package entry exports components and render functions (`Form`, `List`, `Detail`, `Widget`,
`Outline`, `DataView`, `nodeVNode`, `controlsVNode`, `outlineVNode`, `dataVNode`) and `renderForm`,
`renderList` and `renderDetail`. Compilation, form instances, models and error classes come from
`@crudui/generator-core`; this package does not re-export them.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Form operations](../../docs/operations/forms.md)
- [List and detail operations](../../docs/operations/displays.md)
- [Feature status](../../docs/features.md)

Run `npm run test:forms` from the repository root to build and test all adapters.
