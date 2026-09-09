# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| validator-responses | Validator process status and complete response checks | implemented | passed | not-deployed | [Response tests](../examples/cross-check-console/server/validate-response.test.mjs) |
| php-api | Common PHP and extension classes with identical methods | in-progress | pending | not-deployed | [PHP API contract](spec/php-extension.md) |
| generator-php | PHP form generation and SSR | in-progress | pending | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-go | Go form generation and SSR | in-progress | pending | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-rust | Rust form generation and SSR | in-progress | pending | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| php-extension | Native PHP form generation and validation | in-progress | pending | not-deployed | [Extension contract](spec/php-extension.md) |
| expressions | Shared expression grammar and boolean conversion | implemented | passed | not-deployed | [Expression contract](spec/expressions.md) |
| cli | Catalog, static checks and specification descriptions | implemented | passed | not-deployed | [CLI procedure](operations/cli.md) |
| legacy-comparison | Legacy execution, fixture expectations and four-language agreement | implemented | passed | not-deployed | [Testing procedure](operations/testing.md) |
| legacy-examples | Legacy example paths and package builds | implemented | passed | not-deployed | [Examples](spec/examples.md) |
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
| form-typing | Complete native typing and focus during input replacement | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document links, translations and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../tests/ordered-json/check.py) |

## Native package verification

The current OrderedJSON common revision and five implementation submodules passed
575 official processor cases and all 50 CRUDUI JSON cases. These checks cover
parsing, serialization and reconstruction; current runtime integration is pending.

The PHP, Go and Rust generators and the common PHP extension API are implemented.
The shared generator report passed 153 cases in each of JavaScript, PHP, Go,
Rust and native PHP, plus one unchanged-input check: 766 passed, zero failed.
All 640 recorded input files matched the working source after verification.
PHP API checks passed 352 cases in each of three configurations; validation
passed 94 cases in each PHP implementation.

Form checks passed: core 86, React 701, Vue 344, Svelte 345, three mounted Svelte
checks and six HTML normalizer checks. Packaged exports, consumer types,
production builds and three-framework consumer browser checks passed. The three
Chromium widget and timezone checks and `make docs-check` passed.

The non-root Linux image built and loaded the extension. Its full test command
has not run. The new four-server generation endpoints and browser template
integration still require complete HTTP, submission, persistence and browser
verification. The feature rows remain pending for that acceptance scope.
No new comparison image or package has been published.

## Earlier validation and package verification

All 116 cross-check console tests passed, including 35 process-response checks
and actual JavaScript, PHP, Go and Rust CLI execution. Eight initial regression
cases failed before the response parser fix. Missing fields, invalid types,
contradictory results and failed processes now fail comparison. These results
verify the console parser and current CLIs, not the planned native generators.

The validator package build and all 1,606 tests passed after updating internal
legacy translation identifiers.

CLI tests passed all 37 checks after removing and rebuilding validator output.
The four documented commands and two failure exit-code checks passed. CLI CI
builds the validator before testing. These local results do not indicate package
publication.

The package checks use the dependency graph committed in `a5b4491`.
`npm ci`, public declarations and exports (5 checks), repeated build output
(1 check), and the isolated consumer type, production and three-framework browser
checks passed. Form tests passed: core 29, React 692, Vue 344, Svelte 345 and
3 mounted tests, plus 6 normalizer tests. JavaScript validation passed 1,606 tests;
PHP passed 1,418 tests. Go and Rust package tests passed.

A clean Composer installation reproduced all 26 PHP dependency versions and
source references. PHP tests, four-language legacy comparison and the cross-check
console passed with those installed dependencies. PHP CI jobs install from the
lock file; generated dependencies and compiled Go executables are excluded from Git.

Schema checks passed 56 fixtures after `multiple.min` was included. Subsequent
schema annotation changes preserved the parsed validation rules. Documentation
checks pass for the current documents. These checks do not establish a published
package or a completed release.

## Form comparison results

The external environment at `https://crudui.test/` uses library `dfe70a6`,
with PHP, PHP with native JSON parsing, Go and Rust as separate HTTP targets.
All 240 HTTP checks and PHP processor-mode enforcement passed.
Both PHP targets use the PHP validator. These results do not verify native
CRUDUI form generation or validation.

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

Two consecutive `containerctl up` calls preserved container inspection, project
routes, proxy state, certificates, 17 stored files, HTML, health and load responses.
All eight environment checks passed separately from form initialization tests.

Retained comparison implementations have diagnostic failures. Their failures
remain in the reports and cause the complete comparison runner to return a
nonzero status. A passing current implementation does not make those retained
implementations pass. Earlier reports do not verify the current dependency graph.

## Examples and deployment

Legacy examples use `examples/legacy`. Local frontend builds, Go tests, Rust
compilation, PHP API tests and Node HTTP tests passed. Linux images for three
frontend examples and Node, PHP, Go and Rust built. The four server images passed
valid and invalid HTTP cases. PHP PSR-4 autoload generation passed without excluded
application classes. Browser rendering and input checks passed for demo, Playground and Bootstrap
form pages. Bootstrap product checks also verified nested data.

Library deployment means package publication; no package is published.
The comparison application is preserved in an independent external workspace.
The table records completed browser checks for all four servers at `83181c2`.
Retained implementation failures remain in the reports.

TypeScript, Go, Rust and PHP API generation and the strict static site build
passed. Two complete generations produced identical API documentation, native
HTML assets and schema output. Eight generator failure tests passed, and the raw
form inspector passed 18 cases.
