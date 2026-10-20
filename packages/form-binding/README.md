# @polyspec/crudui-form-binding
<!-- doc-id: packages-form-binding-readme -->

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

## Browser validation

`@polyspec/crudui-form-binding` (`packages/form-binding`) validates a server-rendered form in the browser
with the rules the server applies. It is an ESM package that runs only in a browser and depends on
`@polyspec/crudui-validator`. The server stays authoritative: the binding shows errors earlier and stops a
submission it finds invalid, and the server validates every submission it receives.

Browser binding applies user input and row actions. Server runtimes do not implement browser focus, selection or scroll behavior.

`bindForm(form, spec, options)` connects one parsed `form` element that holds one
[complete form](../../docs/spec/form-runtime.md#complete-form) and returns `{ validate(), dispose() }`. It is a separate operation
from generator-core's `bindForm(template, data, options)`. `spec` is the specification the server
validates the same form with, with its composition resolved. `validate()` validates the whole form
as a submission does and returns the validation result. `bindForm` sets `novalidate` on the form
element, so the browser's own constraint validation, such as the format check of an `email`
control, does not stop a submission before the binding validates it; the rules alone decide
validity. `dispose()` removes every listener of the binding and the `novalidate` attribute when the
form did not have it, and leaves the error markup as it is. Every member of `options` is
optional:

- `message` — Value: Function from a validation error to a string; Use: The text shown for that error. Absent uses the error's `message`.
- `formErrors` — Value: Function from the validation result to a list of strings; Use: The form errors written at each validation of the whole form. Absent writes none.

`bindForm` fails with a `TypeError` and the first of these messages, in this order:

- `form` that is not a `form` element: `bindForm requires a form element`
- `options` that is not an object: `Binding options must be an object`
- A member of `options` other than `keyPrefix`, `message` and `formErrors`, the first in member order: `Unknown binding option: {name}`
- `keyPrefix` that is not a string: `keyPrefix must be a string`
- `message` that is not a function: `message must be a function`
- `formErrors` that is not a function: `formErrors must be a function`
- A form that does not contain exactly one `crudui-form__body`: `The form must contain one CRUDUI form`

A validation fails with a `TypeError` when `message` returns a value that is not a string
(`message must return a string`) or `formErrors` returns a value that is not a list of strings
(`formErrors must return a list of strings`). A failure of the validator, such as a
`FormInputError` for data with the wrong shape, propagates unchanged.

### Data

The binding builds the data from the controls of the CRUDUI form as a native submission sends them
and as a server receives them after decoding the bracketed names (PHP's `$_POST`, without the key
prefix). A control takes part when it is an `input`, `select` or `textarea` with a non-empty
`name`, it is inside a node of the form (an element with `data-field-path` or
`data-crudui-row-key` inside the form body) and it is not disabled. Controls outside the nodes,
such as the `hidden` inputs of `renderForm` and the form buttons, take no part. A control of a
node that `design.show` hides takes part, as it does in a submission.

- `input` of type `text`, `email`, `password`, `number`, `range`, `date`, `datetime-local`, `hidden` or another type not named below, and `textarea`: Its current value, a string. A number is the text the control holds, a range is the value the browser holds (the midpoint of its bounds while the rendered value is empty), and a date or datetime is the text the browser submits.
- `input` of type `checkbox`, including a switch, or `radio`: Its `value` when it is checked; nothing when it is not.
- `select`, single or `multiple`: The value of each selected option, inside an `optgroup` or not; nothing when no option is selected.
- `input` of type `file`: Nothing. The browser cannot build the value a server receives for a file.

Each entry is placed at the path its name denotes. The name is `{first}[{segment}]…`, optionally
ending in `[]`; with a key prefix the first segment must equal it and is removed. Each segment
names an object member, so repeated rows are objects keyed by their row keys. A name ending in
`[]` appends its value to a list at that path, in control order. Every value is a string, and
each line break in it is written as CRLF, as the submission encodes it.

A member is absent exactly where a native submission sends nothing: an unchecked checkbox, a
choice or checkbox group without a checked option, a select without a selected option and a
collection without rows. An empty text control is the empty string `""`.

Collection fails with `FormInputError` (code `INVALID_FORM_INPUT`) and the first of these
messages, in control order:

- Not of the form above: `Malformed control name: {name}`
- First segment other than the key prefix: `Control name outside the key prefix: {name}`
- A path that would hold more than one of a value, a list and members: `Control name is both a value and a group: {name}`
- A name without `[]` that has a second entry: `Repeated control name: {name}`

The validator receives this data unchanged. Errors whose path is the data path of a node that
contains a file control are removed from the result: the server validates those nodes with the
files it receives. The result's `valid` is true when no error
remains.

### Error display

The binding writes the markup that `renderForm` writes for the same `errors` and `formErrors`.
Writing a node removes its `crudui-node__errors` slot, whether the server or the binding wrote it,
and, when the node has errors, inserts a new slot directly after its `crudui-node__body` with one
`crudui-node__error` paragraph per error in result order. The node of an error is the node whose
data path equals the error's `path` (see [complete form](../../docs/spec/form-runtime.md#complete-form)); an error whose path
names no node fails with `FormInputError` and the message `Unknown error path: {path}`. Writing
the form errors removes the `crudui-form__errors` element and, when `formErrors` returns texts,
inserts a new one directly before `crudui-form__body` with one `crudui-form__error` paragraph per
text.

The controls of a node are the controls that take part in the data and whose nearest node is
that node; a lang node's controls are those of its lang items. Writing a node with errors sets
`aria-invalid="true"` on its controls, and writing a node without errors removes `aria-invalid`
from them.

### Timing

- A node is validated when one of its controls loses focus after the user changed a control of
  that node (`input` or `change` event), and on every later `input` or `change` event of that
  node. Each of these validations validates the whole data and writes every node validated
  since binding, so a node keeps its server-rendered errors until its first validation.
- The whole form is validated on each `submit` event of the form and on each `validate()` call.
  This writes every node and the form errors, and every node counts as validated afterwards.
- The binding listens for `submit` on the window in the capture phase, before any listener of the
  document or the form. When the form is invalid it calls `preventDefault()` and
  `stopImmediatePropagation()`, so neither the browser nor a library that listens for `submit`,
  such as htmx, sends the request. Focus then moves to the first enabled control, in document
  order, that is inside a node with errors and has no `hidden` ancestor; the binding focuses it
  without scrolling and scrolls it into view only as far as needed, with a visible focus. A valid
  form submits normally. `form.submit()` fires no `submit` event and is not validated. A
  validation that fails with an error does not cancel the submission, and the server validates
  it.
- A renderer that writes the form again replaces the binding's markup; the next validation writes
  it again.

`valid-target` marks the controls whose values the rules check, and `valid-target-async` marks a
select whose options are loaded from a dynamic source (`items` with `model`). The
binding reads neither class: it finds controls by their `name` and node, and validates a dynamic
source select with the value selected when it validates.

### Display

The binding keeps the visibility of the nodes current with the data, as the renderers write it
for the same data, so a field or a group whose `design.show` reads another field appears and
disappears while the user edits. When it binds and after every `input` or `change` event of a
control of the form, before it validates, it builds the data as described in [data](#data) and
reads `hiddenPaths(spec, data)` of `@polyspec/crudui-validator`: the data paths of the fields whose
`design.show` resolves to `false` against the data, in declaration order, each field of a group
row under the row's key, the fields inside a hidden field included. A node with `data-field-path`
has the `hidden` attribute exactly when its path is in that list; a row node and a lang item keep
theirs. When a node becomes hidden, the binding removes the errors of that node and of every node
inside it, with the `aria-invalid` of their controls, because validation evaluates no rule of a
hidden field. The binding changes no value: the controls of a hidden node keep their values and
take part in the data, as they do in a submission.

`hiddenPaths` resolves every condition as validation resolves it and reads data of another shape
as missing; it fails with a `FormInputError` for data that is not an object and with a
`ComposeLoadError` for a specification whose composition cannot be resolved without files.

## Acceptance of the browser binding

- Bind a server-rendered form in the browser: write the error markup that `renderForm` writes
  for the same errors, and in Chromium, Firefox and WebKit show an error when a changed field
  loses focus, send no request for an invalid submission and submit the corrected form.
