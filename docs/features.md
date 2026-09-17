# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| validator-responses | Validator process status and complete response checks | implemented | passed | not-deployed | [Response tests](../examples/cross-check-console/server/validate-response.test.mjs), [Validator process cases](../examples/cross-check-console/validators/README.md) |
| php-api | Common PHP and extension classes with identical methods | implemented | passed | not-deployed | [PHP API contract](spec/php-extension.md) |
| generator-php | PHP form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-go | Go form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-rust | Rust form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-html | Framework-independent form and list HTML rendering | implemented | passed | not-deployed | [Feature contract](spec/feature-contracts.md) |
| php-extension | Native PHP form generation and validation | implemented | passed | not-deployed | [Extension contract](spec/php-extension.md) |
| server-template-browser | Current keyed browser instances from serialized server-compiled templates | implemented | passed | not-deployed | [Form verification procedure](operations/verification.md) |
| native-generation-integration | Current four-server generation, SSR, transport, persistence and browser integration | implemented | passed | not-deployed | [Form verification procedure](operations/verification.md) |
| comparison-deployment | Local comparison deployment of the mounted repository tree, data preservation and identical reapplication | implemented | passed | deployed | [Form verification procedure](operations/verification.md) |
| expressions | Shared expression grammar and boolean conversion | implemented | passed | not-deployed | [Expression contract](spec/expressions.md) |
| cli | Catalog, static checks and specification descriptions | implemented | passed | not-deployed | [CLI procedure](operations/cli.md) |
| form-controls | Labels, multiple choice arrays and field container paths | implemented | passed | not-deployed | [Shared control assertions](../tests/fixtures/form-session/controls.mjs) |
| package-consumer | Packaged exports, type declarations and consumer production build | implemented | passed | not-deployed | [Consumer check](../scripts/check-packages.mjs) |
| package-install | Resolved dependencies and normal installation | implemented | passed | not-deployed | [npm ci / test:packages](spec/package-build.md) |
| package-build | Independent public declaration compilation | implemented | passed | not-deployed | [Build checks](../tests/build/README.md) |
| package-api | Initial package API and version metadata | implemented | passed | not-deployed | [API contract](spec/schema.md) |
| form-template | Data-independent form templates and JSON caching | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-initialization | Initial data, repeated injection and record restoration | implemented | passed | not-deployed | [Runtime contract](spec/form-runtime.md) |
| form-inspector | Parsed DOM, raw HTML, CSS and state comparison with retained differences | implemented | passed | not-deployed | [Inspector tests](../tests/form-inspector/form-snapshot.test.mjs) |
| form-rows | Scoped nested row operations and saved sequence keys | implemented | passed | not-deployed | [Core tests](../packages/generator-core/src/form.test.ts) |
| form-empty-rendering | Explicit empty collection rendering in the merged runtime | implemented | passed | not-deployed | [Empty collection tests](../packages/generator-core/src/empty-collections.test.ts) |
| form-browser | Data injection and row actions in three frameworks | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-typing | Native input updates with stable editable controls, focus and renderer completion | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus movement to the affected row after row operations | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| form-markup | Recursive form nodes, list/detail display blocks, row cards and interface messages in five implementations | implemented | passed | not-deployed | [Form markup](spec/form-markup.md), [display formats](spec/display-formats.md) |
| crudui-details | Read-only detail specification, model, framework-independent HTML rendering and structure validation | implemented | passed | not-deployed | [Specification](spec/schema.md), [display formats](spec/display-formats.md), [feature contract](spec/feature-contracts.md), [shared detail fixture](../tests/fixtures/detail-render/README.md), [native comparison](../tests/native-generators/README.md), [detail validity cases](../tests/fixtures/detail-validity/cases.json) |
| form-view-state | Row collapse and merged undo/redo history outside record data | implemented | passed | not-deployed | [Node tests](../packages/generator-core/src/node.test.ts) |
| form-outline | Structure map and current data view | implemented | passed | not-deployed | [Form markup](spec/form-markup.md) |
| form-initialization-comparison | Side-by-side stage comparison of forms created with data and forms injected after mounting | implemented | passed | not-deployed | [Form comparison](spec/form-comparison.md) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document checks and event-driven development rebuilds | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| docs-pages | Static documentation with English, Korean and API pages | implemented | passed | deployed | [Page tests](../tests/docs/site-build.test.mjs), [publication procedure](operations/documentation.md), [published site](https://polyspec.github.io/crudui/) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../tests/ordered-json/check.py) |

## Current comparison deployment verification

The current `main` tree is served by the comparison deployment. PHP, PHP extension, Go and Rust
passed 450 generation checks, 120 persistence checks and 7,008 browser checks with zero failures.
Each browser server completed below the 900,000 millisecond limit, and the container reported zero
zombie processes after verification. The current public contract is the root pipeline example; the
separate benchmark screen is `/benchmark-console/`. The 45-record canonical list uses three pages
of 20, 20 and 5 records. Page-level SSR contains the selected CRUDUI list or detail markup, while
CSR contains only the stage shell. Initialization comparison preserves framework-owned container
markers and compares rendered container contents; Vue's `data-v-app` is not removed.

## Native package verification

On 2026-09-17 the working tree passed every repository check on macOS arm64 with PHP 8.5.10,
Node.js 26.8.1, Go 1.27.0 and Rust 1.98.1:

- `make conformance` passed and the conformance evidence matched `contracts/features.json`. The
  validator suites passed 462 JavaScript, 540 PHP, 470 Go and 101 Rust tests, each including all
  179 shared validation cases. The PHP extension suite passed 37 tests; the address-sanitizer test
  runs on Linux only.
- The shared generator report passed 358 checks in each of JavaScript, the HTML renderer, PHP, Go,
  Rust and native PHP (2,148 in total, zero failed), and its inputs did not change during the run.
  The generator packages passed 226 PHP, 101 Go and 32 Rust tests.
- The cross-check console passed 726 tests, which send every shared validation, list and detail case
  and 45 request cases through all five validator processes.
- The form packages passed core 121, HTML 282, React 460, Vue 430, Svelte 427 and ten mounted
  Svelte checks; the specification CLI passed 38. The form-comparison source suite passed 148
  checks, the package consumer check seven steps, `make format-check`, `make docs-check` and
  `make github-settings-check` passed.

Conformance is checked from evidence. Every suite that runs a shared fixture records which feature,
fixture case and runtime passed, and `make conformance` (and the final CI job) compares that evidence
with `contracts/features.json`: a supported runtime without a passing record for every declared case
fails. [Conformance](spec/conformance.md) defines the standard. The packages, the PHP extension and
the comparison service are not deployed.

## Retained form comparison results

The retained external environment at `https://crudui.test/` uses library `dfe70a6`,
with PHP, PHP with native JSON parsing, Go and Rust as separate HTTP targets.
All 240 HTTP checks and PHP processor-mode enforcement passed.
Both PHP targets use the PHP validator. These retained results do not verify the
current native CRUDUI form generation or validation integration.

| Server | Verified revision | Scenarios | Interactions | Page errors |
| --- | --- | --- | --- | --- |
| PHP | `83181c2` | 120/120 passed | 30/30 passed | 0 |
| PHP with native JSON parsing | `83181c2` | 120/120 passed | 30/30 passed | 0 |
| Go | `83181c2` | 120/120 passed | 30/30 passed | 0 |
| Rust | `83181c2` | 120/120 passed | 30/30 passed | 0 |

Each target covers React, Vue and Svelte with form and ordered JSON transport.
Reports include initial data, later injection, repeated injection, record
restoration, raw HTML, DOM, CSS, control state and row operations. Evidence is
stored in the external comparison workspace under
`.form-comparison/results-83181c2/report-<server>.json`.
Report metadata records source revisions. A total of 108 interaction checks includes all four comparison
modes; 30 belong to the current implementation.

Between these revisions, five TypeScript files changed only API comments and an
unused type import; their executable JavaScript is identical. Generated PHP
dependencies and the Go binary were removed from Git. The new image installs the
same locked PHP dependency versions and builds the server binaries from source.

The current deployment reuses the running comparison container when its image and
mount contract match. Source synchronization preserves container inspection,
project routes, proxy state, certificates, stored files, HTML, health and load
responses. Container creation is limited to bootstrap or an explicit image/mount
contract change.

Retained comparison implementations have diagnostic failures. Their failures
remain in the reports and cause the complete comparison runner to return a
nonzero status. A passing current implementation does not make those retained
implementations pass. Earlier reports do not verify the current dependency graph.

## Deployment

Library deployment means package publication; no package is published.
The comparison application is preserved in an independent external workspace.
The table records completed browser checks for all four servers at `83181c2`.
Retained implementation failures remain in the reports.

TypeScript, Go, Rust and PHP API generation and the strict static site build
passed. Two complete generations produced identical API documentation, native
HTML assets and schema output. Eight generator failure tests passed, and the raw
form inspector passed 18 cases.
