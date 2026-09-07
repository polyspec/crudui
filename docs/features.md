# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| form-template | Data-independent form templates and JSON caching | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-rows | Scoped nested row operations and saved sequence keys | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-browser | Data injection and row actions in three frameworks | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document links, translations and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| form-comparison | Original and 13-character browser comparison | implemented | failed | deployed | [Browser checks](../examples/form-comparison/check.mjs) |
| form-persistence | Keyed native and JSON document-order persistence | implemented | passed | deployed | [Persistence scenarios](../examples/form-comparison/src/frame.mjs) |
| original-keyed-proof | Original public functions with keyed editing, persistence and cache binding | implemented | failed | deployed | [Comparison contract](spec/form-comparison.md) |

Library verification at `5e517a2` (2026-09-07): `npm run test:forms`, the TypeScript validator suite,
PHP/Go/Rust validation conformance, console SSR tests, CLI tests, lint, type
checking and `make docs-check` passed. API generation, schema generation and the
documentation site build passed. Library deployment status refers to package
publication; no package was published. The form comparison example is deployed locally
in Apple container at [localhost:4317](http://localhost:4317). No remote deployment
was run.

## Polyspec form comparison results

The primary comparison uses identical 13-character keyed data with original
`1e8702a` public functions and current runtime `a96f8c3`. The original source is
unchanged. The original example adds a controller and cached binding; the current
example uses the library session. Both submit native fields and keyed JSON to
their respective PHP validators and independent JSON repositories.
[Run the checks](operations/form-comparison.md) at [localhost:4317](http://localhost:4317).

Verified on 2026-09-07 at 09:18 UTC with Chrome 149.0.7827.22, Node 26.8.1 and
PHP 8.4.24 in Apple container. Results for the current comparison code:

| Framework | Original keyed example | Current keyed runtime | Retained array diagnostic |
| --- | --- | --- | --- |
| React | 15 passed, 2 failed | 17 passed | 13 passed, 4 failed |
| Vue | 15 passed, 2 failed | 17 passed | 13 passed, 4 failed |
| Svelte | 15 passed, 2 failed | 17 passed | 13 passed, 4 failed |

All 27 real pointer, keyboard and checkbox checks passed. All nine initial-request
checks confirmed nested inputs existed before PHP data loading. Both PHP repository
checks passed, including position-based reconstruction after physical table
reordering. No browser page errors occurred. The comparison runner returned status
1 because the recorded original-example failures remain failures.

The original keyed example passes hidden-field exclusion, nested input names,
addition, current-value copying, independent descendants, ordering, data injection,
PHP validation, persistence, saved-key updates, parent ownership, deletion and
JSON document order. IDs `[5, 7, 1]` retain their identity; insertion creates ID 8,
copying creates ID 9 and saved positions remain independent of sequence magnitude.
These results establish support for keyed nested data in the original foundation.
They do not establish that all operations were already implemented or that array
positions can replace row identity.

Cache binding passes with the original public `composeProperties`, `buildField`
and `makeTranslate` functions. The example prepares and serializes structure
before data binding, restores the JSON cache and reuses it for successive records.
A composition reference is read once; the loader rejects any later reads. Both
keyed adapters pass the same cache behavior check. The retained array adapter's
cache failure describes its repeated `buildForm` calls, not an inability of the
original public functions to support cached binding.

The original keyed example fails `exact` and `empty` because the original renderer
creates one indexed placeholder for an explicitly empty collection. The row is
visible and its numeric key is rejected during native submission. These are two
checks of the same renderer defect. The current runtime renders zero rows for an
explicit empty collection and passes both checks. The comparison does not filter
placeholder rows or fill explicit empty values to change the result.

Row-operation cases use the same populated fixture in both keyed implementations.
The separate `exact` and `empty` cases retain the empty-department fixture. This
allows row editing and persistence to be checked independently of empty rendering.

JSON processing uses document member order as row order without additional order
or identity fields. Preserving order retains the saved order; editing the document
member order changes the stored and rendered order. Native form submission uses
control order. PHP repository loading reconstructs either form from stored
positions, independently of physical table record order.

The earlier array diagnostic remains selectable. Its four failures are hidden
sequence fields added by the example (`identity`), the renderer's empty-row behavior
(`exact`, `empty`) and the example's lack of cached binding (`cache`). It is not an
accepted replacement. The separate keyed-input case also passes with the original
renderer and its PHP validator.

All comparison implementations, source snapshots and historical results remain
available. Repository cleanup has not started. The browser runner returns status
1 for any failed scenario; diagnostic failures are not converted to passes.
SQL database drivers and external editor widgets are outside this example's
verification scope.
