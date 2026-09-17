# Empty repeated collections

[한국어](empty-collections.ko.md).

`bindForm` generates zero rows for an explicit empty object in repeated groups and
scalar fields, including nested collections. Missing data creates one initial row
keyed `__0000000000000__`. Collection data that is present and is not a keyed
object, including an array or null, fails with `INVALID_FORM_INPUT` and the
message `Repeated data must be a keyed object: {path}`, where `{path}` is the full
data path including row keys. The [form runtime](form-runtime.md) defines all data
shape rejections.
An empty collection renders one `add-row` control (`data-crudui-action="add-row"`)
in its `crudui-node__footer`, or in the structure map when `multiple.controls` is
`outline`. The control has an accessible label from the interface messages and
does not submit a value; it is disabled when `multiple.max` allows no row.
The shared browser binding inserts the new row into the control's collection.
The [form markup](form-markup.md) defines the node grammar.
A collection declared `multiple: only` has no `add-row` control; an empty one renders its header
and an empty body. Missing data of such a collection is zero rows, not an initial row.
`design.show` controls visibility independently of row count. Hiding a collection
preserves its data and skips its rules; named controls in hidden rows remain part of native
submission.

Editable sessions use keyed objects as specified by the
[form runtime](form-runtime.md); an explicit empty object has zero rows.
Verification and deployment status are recorded in [features](../features.md).
