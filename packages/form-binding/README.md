# @polyspec/crudui-form-binding

[한국어](README.ko.md).

Browser validation of a server-rendered CRUDUI form with the specification the server validates it
with. The package runs only in a browser and depends on `@polyspec/crudui-validator`.

```ts
import { bindForm } from '@polyspec/crudui-form-binding';

const spec = JSON.parse(document.querySelector('#member-spec')!.textContent!);
const binding = bindForm(document.querySelector('form')!, spec, { keyPrefix: 'form' });
```

`bindForm(form, spec, options)` connects a parsed `form` element that holds one complete form
written by `renderForm` with `options.action`. It builds the data from the form controls as a
native submission sends them, validates a changed field when its control loses focus and on every
later change, and validates the whole form on submit. It writes the error markup that `renderForm`
writes for the same errors, sets `aria-invalid` on the controls of a field with errors, and cancels
an invalid submission before any other `submit` listener, such as htmx, receives it.
`options.keyPrefix` is the key prefix of the compiled template, `options.message(error)` returns
the text of an error and `options.formErrors(result)` returns the form errors. The returned object
has `validate()`, which validates the whole form and returns the result, and `dispose()`.

The server validates every submission; the binding shows errors before the request is sent.

- [Browser validation contract](../../docs/spec/form-runtime.md#browser-validation)
- [Validation procedure](../../docs/operations/validation.md#browser-validation)
