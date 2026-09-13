# Empty repeated collections

[한국어](empty-collections.ko.md).

`bindForm` generates zero rows for an explicit empty object in repeated groups and
scalar fields, including nested collections. Missing data creates one initial row
keyed `__0000000000000__`. Collection data that is present and is not a keyed
object, including an array or null, fails with `INVALID_FORM_INPUT` and the
message `Repeated data must be a keyed object: {path}`.
React, Vue and Svelte render an Add button inside each empty collection.
The button uses the `btn-plus` action class, has an accessible label and does not submit a value.
Application controllers insert the new row into the button's collection.
`design.show` controls visibility independently of row count. Hiding a collection
preserves its data; named controls in hidden rows remain part of native submission.

Editable sessions use keyed objects as specified by the
[form runtime](form-runtime.md); an explicit empty object has zero rows.
Verification and deployment status are recorded in [features](../features.md).
