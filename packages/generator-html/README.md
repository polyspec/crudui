# @crudui/generator-html

[한국어](README.ko.md).

Framework-independent HTML rendering for CRUDUI form instances and lists.

```ts
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';

const template = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
const form = createForm(template, { name: 'Example' });
const html = renderForm(form);
```

The renderer consumes evaluated core models and returns an HTML fragment. It does
not create the outer `form` element, bind browser events, validate data or load
records. Use `connectForm` from `@crudui/generator-core` after inserting the
fragment when browser editing is required.

An application that owns its data with `bindForm` renders the same markup with
`renderFormView(bindForm(template, data, options), bindButtons(template, data, options), formMessages(language))`,
and the structure map and data view with `renderOutlineView` and `renderDataPanel`.

`renderList(spec, rows, { layout: 'table' | 'card' })` renders the evaluated list.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Form operations](../../docs/operations/forms.md)
