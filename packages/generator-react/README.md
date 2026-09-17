# @crudui/generator-react

[한국어](README.ko.md).

React rendering for form instances, lists and details.

```tsx
import { buildList, compileForm, createForm } from '@crudui/generator-core';
import { Form, List, renderForm, renderList } from '@crudui/generator-react';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);
const element = <Form form={form} />;

const listSpec = { columns: { name: { field: 'name', label: 'Name' } } };
const rows = [{ name: 'Ada' }];
const listHtml = renderList(listSpec, rows, { language: 'en' });
const list = <List vm={buildList(listSpec, rows, { language: 'en' })} layout="table" />;
```

Render `Form` with the `form` prop. Compile once per shared template and create a form instance
per form. `renderForm(form)` returns the same markup as a string for server rendering.

`List` and `Detail` render models built with `buildList(spec, rows, options)` and
`buildDetail(spec, record, options)` of `@crudui/generator-core`. `renderList(spec, rows, options)` and
`renderDetail(spec, record, options)` return strings.

The package entry exports components (`Form`, `List`, `Detail`, `Cell`, `Node`, `Controls`,
`Widget`, `Outline`, `OutlineView`, `DataView`, `DataPanel`) and the render functions `renderForm`,
`renderList` and `renderDetail`. Compilation, form instances, models and error classes come from
`@crudui/generator-core`; this package does not re-export them.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Form operations](../../docs/operations/forms.md)
- [List and detail operations](../../docs/operations/displays.md)
- [Feature status](../../docs/features.md)

Run `npm run test:forms` from the repository root to build and test all adapters.
