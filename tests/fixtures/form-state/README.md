# Form state fixtures (shared modules)
<!-- doc-id: tests-fixtures-form-state-readme -->

[한국어](README.ko.md).

This folder holds the reference and the generator of five fixture families: [form view](../form-view/README.md),
[form history](../form-history/README.md), [form actions](../form-actions/README.md), [view functions](../view-functions/README.md)
and [history functions](../history-functions/README.md). The first three hold sessions on a form instance for every
implementation: view state, undo history and the actions of `resolveAction` and `runAction`. A case has `name`, `note`, `requirements` (the ids of
[form runtime](../../../docs/spec/form-runtime.md) that it tests), `spec`, `data`, the list `steps` and the list
`expected`, one entry for each step.

A step is `{ op, args }`. `op` is a method of the form instance (`addRow`, `copyRow`, `removeRow`, `moveRow`,
`rekeyRow`, `setValue`, `setData`, `toggleRow`, `setAllExpanded`, `undo`, `redo`), or `runAction` or `resolveAction`,
which call the function of that name with `args[0]`. After a step the implementation reports an object with:

- `result`: the value that the step returned, `null` for no value; absent for a method that returns nothing;
- `error`: `{ code, message }` of the error that the step raised;
- `data`, `revision`, `canUndo` and `canRedo`: `getData()`, the revision and the history flags of the form;
- `collapsed`: the row paths `{collection}.{key}` of the rows of the form fields with `collapsible` true and `expanded`
  false, depth first in field order.

A row key that the case does not write in `spec`, `data` or `steps` is one that an operation generated. The observation
names those keys `$1`, `$2` in the order they first appear in `result`, `data` and `collapsed`, in text and in object
keys, so every implementation can compare its observation with `expected`.

## Comparisons

The TypeScript test [form-state.test.ts](../../../packages/generator/ts/src/form-state.test.ts) runs the reference in
[harness.mts](harness.mts) on the source of the package; the other implementations run the same steps on their own form.
The cases of view functions and history functions call the pure functions of the view and the history.

## Regeneration

Do not edit `cases.json` by hand. The expected observations are the output of the TypeScript reference:

```
node tests/fixtures/form-state/generate.mts
```

The script writes the `cases.json` of the five families.
