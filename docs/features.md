# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| form-template | Data-independent form templates and JSON caching | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-rows | Scoped nested row operations and saved sequence keys | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-browser | Data injection and row actions in three frameworks | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | Complete native typing and focus during input replacement | implemented | passed | deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| original-typing | Preserve typed values in queued original-controller rendering | implemented | passed | deployed | [Native typing checks](../examples/form-comparison/check-typing.mjs) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](../examples/form-comparison/check-interaction.mjs) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document links, translations and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| form-comparison | Original and 13-character browser comparison | implemented | passed | deployed | [Browser checks](../examples/form-comparison/check.mjs) |
| form-persistence | Keyed native and JSON document-order persistence | implemented | passed | deployed | [Persistence scenarios](../examples/form-comparison/src/frame.mjs) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../examples/form-comparison/check-ordered-json.py) |
| ordered-json-runtime | Form and ordered JSON transmission through shared validation and storage | implemented | passed | deployed | [Transport contract](spec/form-comparison.md) |
| form-servers | Independent PHP, Go and Rust submission, validation, storage and reload | implemented | passed | deployed | [Server contract](spec/form-comparison.md) |
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
integration is verified separately by the browser and server results below.
[Verification procedure and scope](operations/ordered-json.md).

## Form comparison results

The primary comparison uses original source `1e8702a` with the explicit-empty
rendering correction `78723bb`, and current runtime `b516226`. The original-source
example adds cached binding and a row controller; the current runtime uses its
library session. Both use identical 13-character keyed data, existing validators
and independent JSON repositories. No hidden sequence fields are submitted.
[Run the comparison](operations/form-comparison.md) at [localhost:4317](http://localhost:4317).
The `form-comparison` status above refers to these two primary implementations.

Browser report timestamp: 2026-09-07 13:47 UTC. Verified with Chrome 149.0.7827.22, Node 26.8.1,
PHP 8.4.24, Go 1.27.0 and Rust 1.98.0 in Apple container. Each table entry covers
React, Vue and Svelte with native form and JSON: six combinations per server.

| Server | Corrected original | Current runtime | Unchanged original keyed | Retained array diagnostic |
| --- | --- | --- | --- | --- |
| PHP | 19/19 in each combination | 19/19 in each combination | 17/19 in each combination | 15/19 in each combination |
| Go | 19/19 in each combination | 19/19 in each combination | 17/19 in each combination | 15/19 in each combination |
| Rust | 19/19 in each combination | 19/19 in each combination | 17/19 in each combination | 15/19 in each combination |

All 324 real interaction checks and all 36 mount-before-server-load checks passed:
108 interactions and 12 mounts per server. The interactions cover typing, pointer
and keyboard focus, selection, scrolling, conditional display, invalid submission
blocking, valid saves and cleared errors after reload. The primary implementations
passed all 684 scenario results. The complete report contains 72 reports and 1,368
scenario results: 1,260 passed and 108 retained diagnostic failures. No browser page
errors occurred. The full runner returned status 1 for those diagnostic failures.

At 13:42 UTC, all 180 shared HTTP checks passed across three servers and four
variants. Multipart, URL-encoded and JSON requests produced identical records,
IDs, parent relationships, positions and loaded order. Checks also inspected
actual file contents, reordered physical records, new and deleted IDs, invalid
required fields, invalid language objects, scalar field types, request limits,
invalid reset requests and corrupt-file preservation. Each server performed its
own parsing, existing CRUDUI validation and atomic persistence. Node forwarded bytes.
Go static analysis and Rust Clippy with warnings denied passed.

The earlier 13:26 report recorded Go/Rust failures to reject invalid native title fields and an
original-controller typing failure. Those reports are retained. The corrected
behavior passed the later HTTP, typing and complete browser checks described here.

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
