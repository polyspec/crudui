# Form structure and data binding

This document defines the form runtime contract. [한국어](form-runtime.ko.md).
Implementation and verification status are recorded in [features](../features.md).

## Structure

`compileForm(spec, options)` resolves composition and creates an immutable form
template without record data. The template contains field definitions and one
child definition per nested group. Repeated groups do not require example rows.
The template can be serialized as JSON and reused by multiple form instances.

`bindForm(template, data, options)` evaluates values, language and display
conditions. It returns node view models, defined by the [form markup](form-markup.md),
without modifying the template or data.
It does not load composition files. Evaluated values and display conditions are
instance state and must not be stored in a shared template cache.

`createForm(template, data, options)` creates an editable instance.
`Form` renders the instance in React, Vue or Svelte. The host owns the HTML
`form` element and submission handling. `renderForm(instance)` renders that same
instance on the server. Data defaults and row identity are prepared by the instance
before either renderer runs. Field-only rendering is an internal operation. `setData(data)`
replaces the record after mounting, including previously edited input values.
The template remains unchanged. `getData()` returns detached submission data.

The template and browser HTML, CSS and JavaScript can be served as static files.
The browser can mount a form before requesting record data; server-side rendering
is not required. For the same template, record and language, creating a instance
with data and injecting that data after mounting must produce identical form
HTML, classes, computed styles, visibility, control state and submitted fields.
Repeated injection of the same data must preserve that result. The same user
actions must produce the same state and submissions under the same row-key inputs.
Removing a resolved inline style must remove the `style` attribute when no
declarations remain. Data injection must not leave attributes from an earlier
record. Replacing data with another record and restoring it must restore the
same elements, attributes, control values and visibility.
The restored HTML string must also match, including attribute order. After a
framework renders a checkbox or radio input, the shared DOM binding places its
`checked` attribute after the other attributes. This order applies to initial
mounting and every update without replacing the input or changing its value.
The inspector compares the resulting HTML without rewriting it.

The `@crudui/generator-html` package renders the same evaluated instance and list
models as HTML strings without React, Vue or Svelte. `renderForm(form)` returns
form content without an outer HTML `form` element; applications insert it into
their host and may then call `connectForm`. `renderList(spec, rows, options)`
returns the declared table or card layout. The package performs no DOM binding,
validation, data loading or widget execution.

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

Instances preserve nonnumeric object key insertion order in memory. Native form
submission follows control order. Keyed JSON uses document member order as row
order, preserved through parsing, editing, persistence and serialization. Form
data contains no auxiliary order or identity fields. Numeric object keys and
keys containing path separators are rejected by editable instances. Callers use `sequenceRowKey` when
constructing data from database sequences. Field paths contain row keys only; no
path segment encodes an array position.

Form binding and editable instances reject data with the wrong shape. They do not
convert arrays or infer hidden identity fields. Each rejection has code
`INVALID_FORM_INPUT` and an empty location. `{path}` is the full data path,
including row keys:

| Data | Message |
| --- | --- |
| Root data that is not an object | `Form data must be an object` |
| A present group value or group row that is not an object | `Group data must be an object: {path}` |
| A present repeated value that is not a keyed object | `Repeated data must be a keyed object: {path}` |

Missing group or repeated data is not a failure. Checks follow template field order,
depth first; a collection is checked before its rows, and rows follow data order.
`addRow` checks a supplied group row value at `{collection}.{key}`.

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
Removing the last row leaves the collection's `add-row` control. Adding a row does not restore deleted
data. Default values apply only when input data is missing.
Rendering rules are defined in [empty collections](empty-collections.md).

## View state and history

An editable instance also owns view state and an undo history, separate from the
record. View state is never submitted or serialized with the data.

| Operation | Result |
| --- | --- |
| `toggleRow(path, key)` | Expand or collapse one row. |
| `setAllExpanded(expanded)` | Expand or collapse every collapsible row. |
| `selectRow(path, key)` | Select one row for the structure map. |
| `undo()` | Restore the record before the last data change; fails when nothing can be undone. |

The snapshot reports `canUndo` and `selection`. History keeps up to 100 records.
Consecutive `setValue` calls on the same path share one entry. `setData` restarts
history, collapsed rows and selection. Removing a row drops its view state;
rekeying a row moves it to the new key. View changes do not change `revision`.
Server rendering uses the initial view: every row expanded and no selection. The
[form markup](form-markup.md) defines the structure map and data view.

## Rendering and validation

Input names and wrapper identifiers include the actual row keys. Rule paths
replace repeated segments with `[]`, based on the form definition rather than a
key pattern. For the example above the rule path is `companies[][stores][][name]`.

The shared runtime manages data and row operations. Browser event binding handles
native input changes and row buttons. Framework adapters render view models and
synchronize browser input properties after updates. Data binding updates text,
textarea, selection, checkbox, language fields and conditional display.

Native typing preserves focus and text selection when rendering replaces an
input element. A duplicate change event with the same value must not replace
the pending focus state.
Each native input event updates the form instance before the framework renders
the next view. Consecutive input events preserve the value accepted by every
preceding event. After rendering completes, the active control value, instance
value and revision represent the last input event. Replacing a control during
rendering must not interrupt the active editing sequence.

Adding or copying a row preserves the active control, its text selection and
ancestor scroll positions. Pointer activation of a row button retains the current
input focus. Keyboard activation retains button focus. Focus restoration does not
scroll the document to the control. When addition replaces an empty collection's
Add button, focus moves to the Add button in that same collection.

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
8. Activate row addition with pointer and keyboard input; preserve focus, text
   selection and scroll positions in React, Vue and Svelte.
9. Send consecutive native input events across framework renders; retain every
   accepted edit and finish with matching control and instance values.

## Input labels and selection

Each native input has a stable DOM identifier derived from its full field path
and the instance `idPrefix` (default `crudui`). Applications rendering multiple
forms in one document provide distinct prefixes; SSR and browser rendering use
the same prefix. Identifiers do not encode or submit additional record data.
Single-control labels use `for`; checkbox and radio captions target their own
input. Group headings do not target an unrelated input.
Widget scripts use the same resolved identifier as their control. CSS selectors
escape the identifier with `CSS.escape`; direct DOM lookup uses
`document.getElementById`. Search initialization and its generated CSS use the
same container class. String arguments in scripts use JSON string escaping and
escape `<`, U+2028 and U+2029. Every widget derives rule paths from the structural
row positions, including choices, file controls, search and action values.
Multiple-choice inputs use an array submission name and preserve every selected
value through injection, editing and submission. An empty selection is an empty
array in instance data.

List rendering uses `renderList(spec, rows, { layout })`; `layout` is `table`
(default) or `card` in every framework.

Field containers use `data-field-path` for the data path relative to the form
root. Only actual controls use `name` for submission. Browser row operations
resolve the nearest field container and do not depend on a generated title.

Unsupported field types produce `UnsupportedFieldTypeError` with code
`UNSUPPORTED_FIELD_TYPE`. The message identifies the field type and path without
a version-specific renderer name.

## HTML serialization

### Date values

Date controls, datetime controls and list date formatting use UTC. A timestamp
with an explicit offset is converted to UTC; a date or datetime without an
offset is interpreted in UTC. Rendering does not depend on the PHP, server or
browser timezone. Datetime controls display seconds and do not remove an offset
before converting its timestamp. Instance data retains the supplied value.

Accepted input forms are `YYYY-MM-DD`, `YYYY-MM-DD[T ]HH:mm`, optional seconds
and fractional seconds, ISO timestamps with `Z` or `+/-HH:mm`, and RFC 2822 dates
with an explicit timezone. Invalid or unsupported date strings remain unchanged
in the field model or list display. Date validity remains a validation concern.
RFC dates accept an optional weekday, a one- or two-digit day, an English
three-letter month, a four-digit year, hours and minutes with optional seconds,
and a numeric `+/-HHMM` offset or `UT`, `GMT`, `EST`, `EDT`, `CST`, `CDT`, `MST`,
`MDT`, `PST`, `PDT`. English names are case-insensitive and separators use spaces
or tabs. A supplied weekday must match the calendar date. Comments, folded lines,
two-digit years and military zones are not accepted. ISO inputs do not trim
surrounding whitespace. Calendar dates, clock values and offsets must be valid.
Tests compare UTC, Asia/Seoul and America/Los_Angeles, including date changes
across midnight and initial data versus subsequent injection.

### Markup and styles

Server renderers preserve the complete evaluated models. Native form and list
HTML follow React static markup, including escaped attributes and image preload
links for actual image elements. Resource hints follow first-use source order,
exclude empty and `data:` sources, and are deduplicated by source. Raw HTML
content is not parsed to produce resource hints. Normal `href` and `src`
attributes reject the JavaScript URL scheme with the same blocked URL output;
explicit raw content retains its declared handling.

Inline CSS parsing separates declarations only at top-level semicolons and the
first top-level colon. Quoted text, escapes, comments and nested parentheses,
brackets and braces remain part of their declaration values. Rendering must not
truncate data URLs or quoted values. Browser styles apply `!important` as a CSS
priority. Field models retain declaration order and values; comparisons must not
remove CSS differences.
