# CRUDUI form comparison

[한국어](README.ko.md).

Compare identical keyed data using the corrected original renderer with example
row operations and cached binding, and the current 13-character runtime. The
unchanged original keyed renderer and earlier array diagnostic remain selectable.
User submissions run the existing JavaScript validator before transmission. The selected PHP, Go or Rust server
validates independently. React, Vue and Svelte submit real forms
and JSON to that server and reload persisted company, store and department records from JSON.
Each frame supports native form and JSON transmission. Both use the same
validation and storage. JSON requests, responses and stored files use ordered-json
with the existing 13-character row keys and document order. Source metadata
includes the pinned processor revision and archive hash.

The page uses static browser files without server-side rendering. Use "Create
form with saved data" for initial data, or "Mount empty form" followed by "Reload
saved data" for later injection. The initialization check compares exact HTML,
computed CSS, control state, repeated injection and row operations with both
form and JSON persistence.
Use "Check data injection idempotence" to run the comparison independently.
Results include each category, unmodified HTML and downloadable evidence.

Run from the repository root:

```sh
node examples/form-comparison/run.mjs start
```

Open [http://localhost:4317](http://localhost:4317).
[Operations](../../docs/operations/form-comparison.md) describe verification and shutdown.
[The contract](../../docs/spec/form-comparison.md) defines source isolation and data shapes.
[Feature status](../../docs/features.md) records actual results and limitations.
