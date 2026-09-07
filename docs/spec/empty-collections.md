# Empty repeated collections

[한국어](empty-collections.ko.md).

Explicit empty arrays and objects generate zero rows for repeated groups and
scalar fields, including nested collections. Missing data creates an initial
row. React, Vue and Svelte render an Add button inside each empty collection.
The button uses the existing `btn-plus` action class and does not submit a value.
Application controllers insert the new row into the button's collection.
`design.show` controls visibility independently of row count. Hiding a collection
preserves its data; named controls in hidden rows remain part of native submission.

This source correction changes row generation and empty-state rendering only.
Verification and deployment status are recorded in [Changes](../../CHANGELOG.md).
