# Form structure and data binding

This document defines the form runtime contract. [한국어](form-runtime.ko.md).
Implementation and verification status are recorded in [features](../features.md).

## Structure

`compileForm(spec, options)` resolves composition and creates an immutable form
template without record data. The template contains field definitions and one
child definition per nested group. Repeated groups do not require example rows.
The template can be serialized as JSON and reused by multiple form instances.

`bindForm(template, data, options)` evaluates values, language and display
conditions. It returns field view models without modifying the template or data.
It does not load composition files. Evaluated values and display conditions are
instance state and must not be stored in a shared template cache.

`createFormSession(template, data, options)` creates an editable instance.
`FormSessionView` renders the instance in React, Vue or Svelte. `setData(data)`
replaces the record after mounting, including previously edited input values.
The template remains unchanged. `getData()` returns detached submission data.

## Row identity

Repeated data uses objects keyed by row identity. A key identifies a row only
within its parent collection. A row key is not an array position.

```text
form[companies][__0000000000001__][stores][__0000000000042__][name]
```

`sequenceRowKey(seq)` produces `__` + a decimal sequence padded to 13 digits +
`__`. It accepts decimal strings and nonnegative integers of at most 13 digits.
`createRowKey()` creates a random 13-character hexadecimal key with the same
delimiters. The runtime never decides whether a row is persisted by inspecting
the key. The server provides the correspondence after saving.

Object keys retain their order. Numeric object keys and keys containing path
separators are rejected by editable sessions. Callers use `sequenceRowKey` when
constructing data from database sequences. Editable sessions do not convert
arrays or infer hidden identity fields.

## Row operations

All operations receive the collection path relative to the form data root.

| Operation | Result |
| --- | --- |
| `addRow(path, { afterKey?, value?, key? })` | Insert one row with a new or supplied key. |
| `copyRow(path, key)` | Copy current values and generate new keys for the copied row and all nested repeated rows. |
| `removeRow(path, key)` | Remove only the selected row. |
| `moveRow(path, key, index)` | Change order without changing row keys or values. |
| `rekeyRow(path, oldKey, newKey)` | Change one row key after saving; regenerate descendant field paths. |

Copying preserves ordinary field values. Database identity is represented by row
keys; the runtime does not infer identity from fields named `id` or `*_seq`.
The same key may occur under different companies without affecting operation
scope. Key collisions, unknown rows and invalid positions fail without changing
the current data or view. `multiple.min` and `multiple.max` constrain row count.

Missing repeated data creates one editable row. Explicit `{}` means zero rows.
Removing the last row leaves an add button. Adding a row does not restore deleted
data. Default values apply only when input data is missing.

## Rendering and validation

Input names and wrapper identifiers include the actual row keys. Rule paths
replace repeated segments with `[]`, based on the form definition rather than a
key pattern. For the example above the rule path is `companies[][stores][][name]`.

The shared runtime manages data and row operations. Browser event binding handles
native input changes and row buttons. Framework adapters render view models and
synchronize browser input properties after updates. Data binding updates text,
textarea, selection, checkbox, language fields and conditional display.

Validation receives the submitted keyed data. Repeated group and scalar fields
preserve their keys in error paths. Collection rules (`required`, `unique`,
`mincount`, `maxcount`) inspect the collection; other scalar rules inspect each
entry. Object entries are validated in sorted key order in all four languages.
Form state does not retain validation errors; applications validate the current
data and display the returned paths.

## Cache and execution limits

The reusable cache artifact is the compiled form structure. A filled HTML string
contains record values and evaluated conditions and is not a reusable template.
The view model is rebuilt when data changes; the runtime does not promise that
DOM nodes remain unchanged when a row identity changes.

Scripts and external editor integrations declared by a field are separate from
native data binding. Browser file inputs cannot be filled from a saved string.
The form runtime does not save records, assign database sequences or deploy an
application.

## Acceptance criteria

1. Prepare all nested fields before record data exists, serialize the template,
   and bind independent records without reloading composition files.
2. Mount each framework view before loading data, then inject and replace data.
3. Copy a store when its key equals its company key; preserve the original
   company, store and sibling values and regenerate descendant row keys.
4. Edit, reorder, remove and add rows without restoring stale values.
5. Apply a saved sequence key and update field names and rule paths correctly.
6. Reject invalid operations atomically and permit adding after deleting all rows.
7. Verify keyed scalar and group validation with shared four-language cases.
