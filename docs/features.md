# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| validator-responses | Validator process status and complete response checks | implemented | passed | not-deployed | [Response tests](../examples/cross-check-console/server/validate-response.test.mjs) |
| php-api | Common PHP and extension classes with identical methods | implemented | passed | not-deployed | [PHP API contract](spec/php-extension.md) |
| generator-php | PHP form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-go | Go form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| generator-rust | Rust form generation and SSR | implemented | passed | not-deployed | [Runtime contract](spec/runtime-packages.md) |
| php-extension | Native PHP form generation and validation | implemented | passed | not-deployed | [Extension contract](spec/php-extension.md) |
| server-template-browser | Current keyed browser instances from serialized server-compiled templates | implemented | passed | not-deployed | [Form verification procedure](operations/verification.md) |
| native-generation-integration | Current four-server generation, SSR, transport, persistence and browser integration | implemented | passed | not-deployed | [Form verification procedure](operations/verification.md) |
| comparison-deployment | Verified local comparison deployment, data preservation and candidate cleanup | implemented | passed | not-deployed | [Form verification procedure](operations/verification.md) |
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
| form-typing | Native input updates with stable editable controls, focus and renderer completion | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| form-empty-focus | Focus after an empty collection creates its first row | implemented | passed | not-deployed | [Shared DOM scenario](../tests/fixtures/form-session/scenario.mjs) |
| form-focus | Focus, selection and scroll retention during row operations | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| keyed-validation | Key-preserving group and scalar validation in four languages | implemented | passed | not-deployed | [Shared validation cases](../tests/fixtures/validate/cases.json) |
| docs-check | Document checks and event-driven development rebuilds | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| docs-pages | Static documentation with English, Korean and API pages | implemented | passed | not-deployed | [Page tests](../tests/docs/site-build.test.mjs), [publication procedure](operations/documentation.md) |
| ordered-json-check | Cross-language JSON document-order verification | implemented | passed | not-deployed | [Processor checks](../tests/ordered-json/check.py) |

## Native package verification

The current OrderedJSON common revision and five implementation submodules passed
575 official processor cases and all 50 CRUDUI JSON cases. These checks cover
parsing, serialization and reconstruction. The candidate runtime also passed the
PHP processor-mode checks and the four-server transport checks.

The PHP, Go and Rust generators and the independent C PHP extension are implemented.
The shared generator report passed 153 cases in each of JavaScript, PHP, Go,
Rust and native PHP, plus one unchanged-input check: 766 passed, zero failed.
The report recorded 640 inputs and confirmed that they did not change during the
run.
PHP API checks passed 352 cases in each of three configurations; validation
passed 94 cases in each PHP implementation.

The current direct-C source revision passed `make test-native` on macOS arm64
with PHP 8.5.10, Node.js 26.8.1, Go 1.27.0 and Rust 1.98.1. The run returned
status 0 after building and loading the C extension, running the package suites,
passing the 19 protocol checks, producing the 766/766 generator report and
passing the widget and timezone checks. The result records verified code; the
extension and comparison service remain not-deployed.

Form checks passed: core 86, React 701, Vue 344, Svelte 345, ten mounted Svelte
checks and six HTML normalizer checks. Packaged exports, consumer types,
production builds and three-framework consumer browser checks passed. The three
Chromium widget and timezone checks and `make docs-check` passed.
A clean source archive passed 136 form-comparison source checks, ten generator
construction checks, three form-comparison Chromium checks, nine public package
checks, one repeated-build check, 18 form-inspector checks and six form-inspector
browser CSS checks. Cross-check rendering passed 33 cases.

The full `make test-native` command passed at commit `e2e1af01` in a non-root
Linux arm64 image. It rebuilt and loaded the extension, ran the
PHP, Go and Rust package tests, repeated the PHP API and validation checks, passed
all 19 protocol checks and all three Chromium widget and timezone checks, and
produced a complete 766/766 generator report. The image index digest is
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`;
the report and run-log SHA-256 values are respectively
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442` and
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`.

Repository-root build and test entry points declare every directly imported
third-party package in the root manifest. The dependency checks inspect the Node.js
entry points executed by `make test-native` and fail when a direct import is not
declared. At commit `757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd`, all six
dependency checks passed. The full `make test-native` command also returned status
0 on macOS arm64 with PHP 8.5.10, Node.js 26.8.1, Go 1.27.0 and Rust 1.98.1. It
passed 160 PHP tests, 20 Rust tests, all Go package tests, 19 protocol checks, the
766/766 generator report and three Chromium widget and timezone checks.

Candidate `757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd` uses one committed source
archive and verifies its commit and SHA-256 digest before extraction. The source
archive SHA-256 is
`2175aec2e0aa72837d2886f14b2279a975329336f088197c60bf8f8e4ae89f45`.
Image `localhost/crudui-form-comparison:757f144b9c4b` has index digest
`sha256:7842bd0a40f1e51d4c975008a9b5bdaf6d148e9faba05e68faf3a935b02fe2c7`.
Image construction passed 81 source checks and four library checks. The image
passed the Chromium process check as the application user and started one PHP,
PHP extension, Go and Rust server from that archive.

Generation and SSR passed 290 of 290 checks across 411 HTTP requests. Persistence
and validation passed 120 of 120 checks. The browser aggregate passed 960 scenario
checks, 240 interaction checks, 24 mount-before-load checks and 24 static-document
checks with zero failures. PHP completed in 213,288 milliseconds, the PHP extension
in 206,475 milliseconds, Go in 200,691 milliseconds and Rust in 200,500
milliseconds. Every server completed below the 900,000 millisecond limit. The
aggregate records `complete: true`, `passed: true`, `failedChecks: 0` and
`performancePassed: true`. The browser aggregate, generation report and server
report SHA-256 values are respectively
`ee25ad9c1ea6c1f616b6f63c0bad87b6aa95e4e1c64cf091da513bcfc7f9ad30`,
`9bba9a8a13b4d06b1c14f347178747ad73c86d71db60c5d131a24f936beaa373` and
`218921211380bd1339d62665e1180c2b41bbb5cdfbcd57326e1778f9c5debb38`.
The candidate image is local, and packages and the comparison service are not
deployed.

## Earlier validation and package verification

All 116 cross-check console tests passed, including 35 process-response checks
and actual JavaScript, PHP, Go and Rust CLI execution. Eight initial regression
cases failed before the response parser fix. Missing fields, invalid types,
contradictory results and failed processes now fail comparison. These results
verify the console parser and the CLIs at that revision, not the later native
generator implementations.

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
