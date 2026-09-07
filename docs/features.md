# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| form-template | Data-independent form templates and JSON caching | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-rows | Scoped nested row operations and saved sequence keys | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-browser | Data injection and row actions in three frameworks | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | Complete native typing and focus during input replacement | implemented | passed | deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document links, translations and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| form-comparison | Original and 13-character browser comparison | implemented | passed | deployed | [Browser checks](../examples/form-comparison/check.mjs) |
| form-persistence | Keyed native and JSON document-order persistence | implemented | passed | deployed | [Persistence scenarios](../examples/form-comparison/src/frame.mjs) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../examples/form-comparison/check-ordered-json.py) |
| ordered-json-runtime | Form and ordered JSON transmission through shared validation and storage | implemented | passed | deployed | [Transport contract](spec/form-comparison.md) |
| form-client-validation | Existing JavaScript validation before user submission | implemented | passed | deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| original-empty-correction | Corrected original rendering and complete empty collection lifecycle | implemented | passed | deployed | [Comparison contract](spec/form-comparison.md) |
| original-keyed-proof | Original public functions with keyed editing, persistence and cache binding | implemented | failed | deployed | [Comparison contract](spec/form-comparison.md) |

Library verification at `5e517a2` (2026-09-07): `npm run test:forms`, the TypeScript validator suite,
PHP/Go/Rust validation conformance, console SSR tests, CLI tests, lint, type
checking and `make docs-check` passed. API generation, schema generation and the
documentation site build passed. Library deployment status refers to package
publication; no package was published. The form comparison example is deployed locally
in Apple container at [localhost:4317](http://localhost:4317). No remote deployment
was run.

## JSON processor results

JSON processor verification on 2026-09-07 used ordered-json commit `deb1b354`.
JavaScript, PHP, the PHP extension, Go and Rust each passed 115 processor cases
and ten CRUDUI transport fixtures. Host versions were Node 26.8.1, PHP 8.5.10,
Go 1.27.0 and Rust 1.98.1 on macOS arm64. The transport fixtures cover order,
13-character keys, new/copied/saved row representations and empty object/array
types. These processor checks do not execute form row operations. Runtime
integration is verified separately by the browser and PHP results below.
[Verification procedure and scope](operations/ordered-json.md).

## CRUDUI form comparison results

The primary comparison uses original source `1e8702a` with the explicit-empty
rendering correction `78723bb`, and current runtime `b516226`. The original-source
example adds cached binding and a row controller; the current runtime uses its
library session. Both use identical 13-character keyed data, existing validators
and independent JSON repositories. No hidden sequence fields are submitted.
[Run the comparison](operations/form-comparison.md) at [localhost:4317](http://localhost:4317).
The `form-comparison` status above refers to these two primary implementations.

Verified on 2026-09-07 at 11:35 UTC with Chrome 149.0.7827.22, Node 26.8.1 and
PHP 8.4.24 in Apple container:

| Framework | Transmission | Corrected original | Current runtime | Unchanged original keyed | Retained array diagnostic |
| --- | --- | --- | --- | --- | --- |
| React | Form | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |
| React | JSON | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |
| Vue | Form | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |
| Vue | JSON | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |
| Svelte | Form | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |
| Svelte | JSON | 19 passed | 19 passed | 17 passed, 2 failed | 15 passed, 4 failed |

All 108 real interaction checks and all 12 mount-before-PHP-load checks passed.
The interactions include complete native typing, pointer and keyboard focus,
selection, scrolling, conditional display, blocked invalid submissions, successful
corrected submissions and cleared errors after reload. Twelve checks specifically
verify keyboard addition to empty collections in the primary implementations.
Both PHP repository checks passed. No browser page errors occurred. The full
runner returned status 1 because retained diagnostic failures remain failures.

Each frame selects native multipart or JSON transmission. Browser JSON requests,
PHP request/response processing and stored JSON files use ordered-json `deb1b354`.
The processor archive SHA-256 is
`27a42f171995714509215421c009eb63768acb6c7480264a51a77b522236cd86`.
The same validators and repository handle both formats. Actual HTTP content types
and JSON body shapes passed inspection. Identical edited/copied data produced
identical records, saved keys, parent IDs, positions and loaded values through
both formats. Invalid JSON and unsupported content types were rejected without
changing records. Three JavaScript conversion tests, PHP conversion checks and
both repository checks passed in the container. TypeScript validation passed 44
tests; PHP validation passed 61 tests, including the shared validation and list
cases; Go and Rust validation conformance passed. `make docs-check` passed.

The example runs the existing JavaScript validator before user submission and
PHP validates independently. No validation rules changed. A required empty field
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
published. Repository cleanup has not started. SQL drivers and external editor
widgets are outside this comparison's verification scope.
