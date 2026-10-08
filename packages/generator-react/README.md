# @polyspec/crudui-generator-react
<!-- doc-id: packages-generator-react-readme -->

[한국어](README.ko.md).

React rendering for form instances, lists and details.

```tsx
import { buildList, compileForm, createForm } from '@polyspec/crudui-generator-core';
import { Form, List } from '@polyspec/crudui-generator-react';
import { renderForm, renderList } from '@polyspec/crudui-generator-react/server';

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
per form. `renderForm(form, options)` returns the same markup as a string for server rendering;
`options` makes it the [complete form](../../docs/spec/form-runtime.md#complete-form), and `Form`
accepts the same `options` prop.

`List` and `Detail` render models built with `buildList(spec, rows, options)` and
`buildDetail(spec, record, options)` of `@polyspec/crudui-generator-core`. `renderList(spec, rows, options)` and
`renderDetail(spec, record, options)` return strings.

The component entry exports `Form`, `List`, `Detail`, `Cell`, `Node`, `Controls`,
`Widget`, `Outline`, `OutlineView`, `DataView`, `DataPanel`). The server entry exports
`renderForm`, `renderList` and `renderDetail`. Compilation, form instances, models and error classes come from
`@polyspec/crudui-generator-core`; this package does not re-export them.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Form operations](../../docs/operations/forms.md)
- [List and detail operations](../../docs/operations/displays.md)
- [Feature status](../../docs/features.md)

Run `npm run test:forms` from the repository root to build and test all adapters.
