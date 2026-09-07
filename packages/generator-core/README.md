# @crudui/generator-core

[한국어](README.ko.md).

Framework-independent form compilation, editable sessions and list evaluation.

```ts
import { compileForm, createFormSession } from '@crudui/generator-core';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const session = createFormSession(template);
session.setData({ name: 'Example' });
```

Compile once per shared template and create a session per form instance.
Use `bindForm(template, data)` to evaluate fields without creating an editable session.

- [Runtime contract](../../docs/spec/form-runtime.md)
- [Setup, nested rows and verification](../../docs/operations/forms.md)
- [Feature status](../../docs/features.md)

Run `npm run test:forms` from the repository root to build and test all adapters.
