# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| form-controls | Labels, multiple choice arrays and field container paths | implemented | passed | not-deployed | [Shared control assertions](../tests/fixtures/form-session/controls.mjs) |
| package-consumer | Packaged exports, type declarations and consumer production build | implemented | passed | not-deployed | [Consumer check](../scripts/check-packages.mjs) |
| package-build | Independent public declaration compilation | implemented | passed | not-deployed | [Build checks](../tests/build/README.md) |
| package-api | Initial package API and version metadata | in-progress | pending | not-deployed | [API contract](spec/schema.md) |
| form-template | Data-independent form templates and JSON caching | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-initialization | Initial data, repeated injection and record restoration | implemented | passed | not-deployed | [Runtime contract](spec/form-runtime.md) |
| form-inspector | Parsed DOM, raw HTML, CSS and state comparison with retained differences | implemented | passed | not-deployed | [Inspector tests](../examples/form-comparison/src/form-snapshot.test.mjs) |
| form-rows | Scoped nested row operations and saved sequence keys | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-empty-rendering | Explicit empty collection rendering in the merged runtime | implemented | passed | not-deployed | [Empty collection tests](../packages/generator-core/src/empty-collections.test.ts) |
| form-browser | Data injection and row actions in three frameworks | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | Complete native typing and focus during input replacement | implemented | passed | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| original-typing | Preserve typed values in queued original-controller rendering | implemented | passed | not-deployed | [Native typing checks](../examples/form-comparison/check-typing.mjs) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document links, translations and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| form-comparison | Original and 13-character browser comparison | in-progress | pending | not-deployed | [Browser checks](../examples/form-comparison/check.mjs) |
| form-persistence | Keyed native and JSON document-order persistence | in-progress | pending | not-deployed | [Persistence scenarios](../examples/form-comparison/src/frame.mjs) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../examples/form-comparison/check-ordered-json.py) |
| ordered-json-runtime | Form and ordered JSON transmission through shared validation and storage | in-progress | pending | not-deployed | [Transport contract](spec/form-comparison.md) |
| php-extension-server | Independent PHP extension requests and persistence | in-progress | pending | not-deployed | [Processor modes](spec/form-comparison.md#php-processor-modes) |
| form-servers | Independent PHP, Go and Rust submission, validation, storage and reload | in-progress | pending | not-deployed | [Server contract](spec/form-comparison.md) |
| form-client-validation | Existing JavaScript validation before user submission | in-progress | pending | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| original-empty-correction | Corrected original rendering and complete empty collection lifecycle | implemented | passed | not-deployed | [Comparison contract](spec/form-comparison.md) |
| original-keyed-proof | Original public functions with keyed editing, persistence and cache binding | implemented | failed | not-deployed | [Comparison contract](spec/form-comparison.md) |

Library verification at `5e517a2` (2026-09-07): `npm run test:forms`, the TypeScript validator suite,
PHP/Go/Rust validation conformance, console SSR tests, CLI tests, lint, type
checking and `make docs-check` passed. API generation, schema generation and the
documentation site build passed. Library deployment status refers to package
publication; no package was published. The form comparison example is deployed locally
in Apple container at [localhost:4317](http://localhost:4317). No remote deployment
was run.

PHP extension integration passed 240 HTTP checks in the isolated
`crudui-extension-check` container. Evidence is
`.form-comparison/extension-check/results/server-report.json`. Both PHP modes
and mode enforcement passed `test-php-modes.mjs`. Extension browser verification
and replacement of the main comparison container are pending.

## Current server verification

The local comparison container uses library source `30ff267`. Current PHP, Go
and Rust entries passed 180 HTTP checks across all four comparison variants.
The checks cover native multipart, URL-encoded and ordered JSON requests,
stored records, reload, validation failures and corrupt-file preservation.
The report is `.form-comparison/results/server-report.json`. Browser lifecycle
verification is in progress. JavaScript validation runs in the browser and the
CLI. No package was published. Historical reports below retain their
original source revisions.

## Form initialization inspector

The shared DOM binding now fixes the `checked` attribute position during both
initial rendering and updates. The full HTML restoration regression failed in
React and Vue before this correction. It now compares the complete restored HTML
and verifies that the checkbox elements are retained. Source `f4ec125` is running
in the local comparison container and passed the browser checks below.

On 2026-09-08, generator builds and 1,405 tests passed: core 25, React 690,
Vue 343, Svelte 345 and Svelte client 2. Shared mounted tests compare initial data,
three repeated injections, visibility changes and record restoration. The React
renderer removes the empty `style` attribute after its last declaration is cleared.
All 18 inspector tests passed, including missing attributes, changed row keys,
child order and control properties that differ without changing HTML. Six Chrome
checks verified computed CSS, hidden display and both pseudo-elements, including
deliberate differences and restored styles. The inspector is running in the local
comparison. No package was published.

The current runtime passed all 2,160 category checks comparing initial-data
creation with post-mount injection: 18 server/framework/transport combinations,
15 stages and eight categories. All 576 repeated-injection checks passed, including
raw HTML. All 378 DOM comparisons passed, including record replacement and restoration.
All 378 raw HTML comparisons and all 288 restoration category checks passed.
The 24 previous React/Vue restoration differences are resolved. All 18 current
runtime reports passed 20/20 scenarios, including HTML, DOM, CSS, control state,
fields, data, focus and server responses. The inspector does not reorder live
attributes or remove differences from exported HTML; the shared DOM binding
controls the rendered checkbox attribute order.
Korean React and English Vue browser checks through Rust verified the dedicated
button, 30-stage evidence, all 168 category results per run, JSON downloads and
exact HTML downloads. Downloaded initial HTML matched restored HTML exactly.

## Empty collection merge verification

Merged-code verification on 2026-09-07 passed the generator builds and 1,402 tests:
core 25 (including six empty-collection regressions), React 689, Vue 342, Svelte
345 and Svelte client 1. The regression tests use `compileForm` and `bindForm`.
The correction commit is included in `main` history. No package was published;
the local comparison retains its pinned source revisions and reports below.
[Empty collection contract](spec/empty-collections.md).

## JSON processor results

JSON processor verification on 2026-09-07 used ordered-json commit `deb1b354`.
JavaScript, PHP, the PHP extension, Go and Rust each passed 115 processor cases
and ten CRUDUI transport fixtures. Host versions were Node 26.8.1, PHP 8.5.10,
Go 1.27.0 and Rust 1.98.1 on macOS arm64. The transport fixtures cover order,
13-character keys, new/copied/saved row representations and empty object/array
types. These processor checks do not execute form row operations. Runtime
integration is verified separately by the browser and server results below.
[Verification procedure and scope](operations/ordered-json.md).

## Form comparison results

The primary comparison uses original source `1e8702a` with the explicit-empty
rendering correction `78723bb`, and current runtime `f4ec125`. The original-source
example adds cached binding and a row controller; the current runtime uses its
library session. Both use identical 13-character keyed data, existing validators
and independent JSON repositories. No hidden sequence fields are submitted.
[Run the comparison](operations/form-comparison.md) at [localhost:4317](http://localhost:4317).
The `form-comparison` status above refers to these two primary implementations.

The three server reports were generated on 2026-09-07 at 16:36 UTC and combined
at 16:37 UTC. Chrome 149.0.7827.22, Node 26.8.1, PHP 8.4.24, Go 1.27.0 and
Rust 1.98.0 were used. Each table entry covers both native form and JSON.

| Server | Framework | Corrected original | Current runtime | Unchanged original keyed | Retained array diagnostic |
| --- | --- | --- | --- | --- | --- |
| PHP, Go, Rust | React | 19/20 | 20/20 | 17/20 | 15/20 |
| PHP, Go, Rust | Vue | 19/20 | 20/20 | 17/20 | 15/20 |
| PHP, Go, Rust | Svelte | 20/20 | 20/20 | 18/20 | 15/20 |

The report contains 72 reports and 1,440 scenario results: 1,290 passed and 150
failed. Each server runner returned status 1. The failures include 108 previous
diagnostics and 42 initialization cases in the retained sources. The initialization
inspector records 168 raw HTML differences and 168 DOM differences in those sources. Historical
React and Vue renderers, and the array Svelte example, retain an empty `style`
attribute after hidden content becomes visible. Their source snapshots and
failures remain available. All current-runtime checks passed. The retained-source
pass/fail results match the preceding report; no additional failures occurred.

All 324 interaction checks, 36 mount-before-load checks and 36 static-document
checks passed. Static HTML hashes matched across all three API servers. There
were no browser page errors. All 2,160 stage snapshots were exported, including
original HTML, parsed DOM and control state. The complete report is
`.form-comparison/results/report.json`; `initialization-summary.json` records the
counts and report hash. Server reports and the stopped 42-report run are retained.
An intermediate run at 16:26 UTC is also retained. An additional progress-monitor
connection changed its viewport from 1680 × 1100 to 800 × 600 and caused five CSS
differences in one corrected-original Svelte case. An isolated browser check
reproduced that change. The monitor was removed and the complete matrix was rerun
without another browser connection. The final report has no CSS mismatches.
The stopped run was preserved before splitting the 15-minute browser protocol
call by API server. It is not counted as complete verification.

At 16:38 UTC, all 180 shared HTTP checks passed across three servers and four
variants. Multipart, URL-encoded and JSON requests produced identical records,
IDs, parent relationships, positions and loaded order. Checks also inspected
actual file contents, reordered physical records, new and deleted IDs, invalid
required fields, invalid language objects, scalar field types, request limits,
invalid reset requests and corrupt-file preservation. Each server performed its
own parsing, existing CRUDUI validation and atomic persistence. Node forwarded bytes.
All 36 native typing cases passed again at 16:38 UTC. The earlier 54 bilingual UI
selection checks, Go static analysis and Rust Clippy results remain recorded in
the changelog.

Each frame selects native multipart or JSON transmission. Browser JSON requests,
PHP, Go and Rust request/response processing and stored JSON files use ordered-json `deb1b354`.
The processor archive SHA-256 is
`27a42f171995714509215421c009eb63768acb6c7480264a51a77b522236cd86`.
The same validators and repository handle both formats. Actual HTTP content types
and JSON body shapes passed inspection. Identical edited/copied data produced
identical records, saved keys, parent IDs, positions and loaded values through
both formats. Invalid JSON and unsupported content types were rejected without
changing records. Three JavaScript conversion tests, PHP conversion checks and
both PHP repository checks passed in the container. `make docs-check` passed. Retained validation results from
11:35 UTC: TypeScript passed 44 tests; PHP validation passed 61 tests, including the shared validation and list
cases; Go and Rust validation conformance passed. `make docs-check` passed.

The example runs the existing JavaScript validator before user submission and
each server validates independently. No library validation rules changed. A required empty field
fails even when hidden by design. An added department with an optional empty name
passes validation and is stored without filtering or replacement. Empty-collection
checks cover visibility, nested and complete deletion, addition after deletion,
native and JSON persistence, unchanged sibling IDs, parent relationships and focus.

Native input names, current-value copying, independent descendants, data injection,
saved-key updates, ownership rejection, deletion and document order pass in both
primary implementations. IDs `[5, 7, 1]` keep their identity; insertion creates ID 8
and copying creates ID 9. JSON document member order determines row order without
additional identity or ordering fields. Loading reconstructs the hierarchy from
stored positions independently of physical table order.

Cached binding passes using the original public `composeProperties`, `buildField`
and `makeTranslate`. Structure is serialized and restored before data binding,
and a composition reference is read once. Later data injection does not read the
reference again or change the cached structure. These results demonstrate the
original foundation with the documented source correction and example binding;
array positions are not a replacement for saved row identity.

The unchanged original keyed diagnostic fails `exact` because its generated `[0]`
row key is rejected with HTTP 400, and `empty` because its explicit empty collection
renders a row. These are identity/rendering results, not a `required` failure.
The array diagnostic additionally fails hidden-field exclusion and cached binding
because of its example configuration. Neither diagnostic is used as the accepted
implementation. Their source and reports remain available for review.

Retained library source verification from 10:15 UTC: 21 corrected-original core tests; original-source SSR
conformance in React (273), Vue (273) and Svelte (363); current mounted DOM checks
in all three frameworks; core type checking; and `make docs-check` passed. The
existing 43 validation cases passed in TypeScript, PHP, Go and Rust. TypeScript
also passed the fixture-coverage test. PHP validation was checked in the container.

The example runs locally in Apple container. No package or remote deployment was
published. All comparison implementations remain selectable. SQL drivers and
external editor widgets are outside this comparison's verification scope.

## Original-controller typing results

Verified on 2026-09-07 at 13:41 UTC: all 36 native keyboard cases passed in
React, Vue and Svelte for corrected original, unchanged original keyed, retained
array and current runtime examples. Character intervals were 0, 10 and 50 ms.
Immediate and settled values, focus and caret positions were preserved; no browser
page errors occurred. The original example controller cancels superseded input
renders and restores focus after the framework commits the DOM. Library source
snapshots are unchanged. This correction is deployed in the local comparison
container; no package was published.

Current worktree verification (2026-09-08): 1,409 form tests, 1,579 JavaScript
validator tests, 1,392 PHP tests, Go and Rust tests, 42 console checks, and 18
inspector tests passed. Svelte type checking reported zero errors and warnings.
The packaged consumer passed export-file checks, TypeScript compilation and a
three-framework production build. These results do not establish container
deployment or complete the browser/server transport matrix.
