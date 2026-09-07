# Changes

[한국어](CHANGELOG.ko.md).

## 2026-09-07 — Explicit empty collections

Repeated groups and scalar fields generate zero rows for explicit empty arrays
and objects. Missing values still generate an initial row. React, Vue and Svelte
render an Add button for empty collections. Visibility continues to use
`design.show` without changing data.

Verification: 21 core tests passed, including six empty-collection regression
tests. On the source before this correction, four of the six regression tests
failed and the two missing-data tests passed. Browser and PHP integration
verification is pending. Deployment: not deployed.
