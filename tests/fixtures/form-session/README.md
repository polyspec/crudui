# Form session scenarios

[한국어](README.ko.md).

This family contains shared modules instead of `cases.json`. Each framework test mounts its own
form and passes it with `expect` and a `flush` function that waits for rendering.

- [`scenario.mjs`](scenario.mjs) exports a nested repeated form `spec`, its `data`, the row keys
  `companyKey`, `storeKey` and `otherStoreKey`, `storesPath` and `exerciseSessionDom`. The company
  key and a store key are deliberately equal, so a replacement must be scoped by path.
  `exerciseSessionDom` loads data into a mounted form and checks an empty value over a default, a
  date-time shown as a date, editing, adding, removing, copying and moving rows with focus after
  each action, an unavailable action with `aria-disabled`, collapsing and expanding rows through
  `aria-controls`, undo, rekeying a row, a field hidden by a checkbox condition, a record injected
  over edited controls, and focus after the last row is removed and an empty collection gets a row.
- [`controls.mjs`](controls.mjs) exports `controlSpec` and `exerciseControls`, which check label
  targets, multiple choice arrays, native `FormData`, restored records and unique element IDs.
- [`initialization.mjs`](initialization.mjs) exports `compareServerTakeover` and
  `compareInitialization`.
- [`data-rows.mjs`](data-rows.mjs) exports `onlySpec`, `onlyData` and `exerciseOnlyRows`, which
  checks that a `multiple: only` collection without data has zero rows and no row controls, that
  it holds exactly the data rows under their keys after `setData`, and that `addRow`, `copyRow`,
  `removeRow`, `moveRow` and `rekeyRow` fail with `INVALID_FORM_INPUT` and
  `Rows of variants come only from data` without changing the data or the view. It also exports
  `visibilitySpec`, `visibilityData` and `exerciseHiddenValues`, which hides and shows a group by
  clicking the checkbox its `design.show` reads and checks that the group's values stay in the
  controls and in `getData()`, including a value set while it is hidden.
- [`typing.mjs`](typing.mjs) exports `typingSpec`, `installWidgetHost` and `exerciseTyping`.
  `installWidgetHost(document)` gives the document the helpers widget scripts call and records
  each call; a test installs it before mounting the form. `exerciseTyping` types into number,
  text, textarea and behavior-bearing text controls one character at a time, moves the caret, and
  picks a select option, a radio button and a checkbox. After every re-render it requires the
  same control, button, script, style and raw display element nodes, the focus on the edited
  control, the typed order, the caret and the form values, and that each widget script ran once.

## Comparisons

The scenario and control checks assert through the `expect` the framework test passes.
`compareServerTakeover` renders the session with the HTML renderer's `renderForm` and requires the
framework form to have the same parsed DOM, ignoring comments, empty text nodes and attribute order
and comparing `style` attributes as the CSS object model serializes them. `compareInitialization`
compares a form created with data against a mounted form that receives the same data three times
through `setData`: the state from the [form inspector](../../form-inspector/form-snapshot.mjs)
without serialized HTML, the JSON of `getData()` and an unchanged `template`. It then changes and
restores a value in both forms and requires equal states and the same checkbox elements.

The [React](../../../packages/generator-react/src/__tests__/Form.test.tsx),
[Vue](../../../packages/generator-vue/test/form-session.test.mjs) and
[Svelte](../../../packages/generator-svelte/test/form-session.client.mjs) form tests and the
[HTML renderer session test](../../../packages/generator-html/src/form-session.test.ts) use all four
modules. The [core form test](../../../packages/generator-core/src/form.test.ts) uses the scenario
`spec`, `data`, row keys and `storesPath`.

## Regeneration

There is no generator; the modules are written by hand. A change applies to every framework at
once. Keep `spec` and `data` consistent with the assertions, keep the arguments the framework tests
pass (`element`, `session` or `form`, `expect` and `flush`), and keep the exports the core form
test imports.
