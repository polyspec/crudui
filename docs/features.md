# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| legacy-examples | Legacy example paths and package builds | in-progress | pending | not-deployed | [Examples](spec/examples.md) |
| form-controls | Labels, multiple choice arrays and field container paths | implemented | passed | not-deployed | [Shared control assertions](../tests/fixtures/form-session/controls.mjs) |
| package-consumer | Packaged exports, type declarations and consumer production build | implemented | passed | not-deployed | [Consumer check](../scripts/check-packages.mjs) |
| package-install | Resolved platform dependencies and normal install scripts | implemented | passed | not-deployed | [npm ci / test:packages](spec/package-build.md) |
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

## Current verification

The package checks use the dependency graph committed in `a5b4491`.
`npm ci`, public declarations and exports (5 checks), repeated build output
(1 check), and the isolated consumer type, production and three-framework browser
checks passed. Form tests passed: core 26, React 691, Vue 344, Svelte 345 and
3 mounted tests, plus 6 normalizer tests. JavaScript validation passed 1,579 tests;
PHP passed 1,392 tests. Go and Rust package tests passed.

Schema checks passed 56 fixtures after `multiple.min` was included. Subsequent
schema annotation changes preserved the parsed validation rules. Documentation
checks pass for the current documents. These checks do not establish a published
package or a completed release.

## Form comparison results

The local environment at [localhost:4317](http://localhost:4317) uses library
`a5b4491`, with PHP, PHP extension, Go and Rust as separate HTTP targets.
All 240 HTTP checks and PHP processor-mode enforcement passed.

| Current implementation | Scenarios | Interactions | Page errors |
| --- | --- | --- | --- |
| PHP | 120/120 passed | 30/30 passed | 0 |
| PHP extension | 120/120 passed | 30/30 passed | 0 |
| Go | pending | pending | pending |
| Rust | pending | pending | pending |

Each target covers React, Vue and Svelte with form and ordered JSON transport.
Reports include initial data, later injection, repeated injection, record
restoration, raw HTML, DOM, CSS, control state and row operations. Evidence is
stored in `.form-comparison/results/report-<server>.json`. Report metadata records
source revisions. A total of 108 interaction checks includes all four comparison
modes; 30 belong to the current implementation.

Retained comparison implementations have diagnostic failures. Their failures
remain in the reports and cause the complete comparison runner to return a
nonzero status. A passing current implementation does not make those retained
implementations pass. Earlier reports do not verify the current dependency graph.

## Examples and deployment

Legacy examples use `examples/legacy`. Local frontend builds, Go tests, Rust
compilation, PHP API tests and Node HTTP tests passed. Linux images for three
frontend examples and Node, PHP, Go and Rust built. The four server images passed
valid and invalid HTTP cases. PHP PSR-4 autoload generation passed without excluded
application classes. Frontend browser verification remains pending.

Library deployment means package publication; no package is published.
The comparison application is available locally and has not completed its full
browser matrix. Release verification and repository cleanup remain in progress.
