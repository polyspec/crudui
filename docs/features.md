# Feature status

[한국어](features.ko.md). Contracts are defined in [spec](spec/form-runtime.md).
Tests and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| validator-responses | Validator process status and complete response checks | implemented | passed | not-deployed | [Response tests](../examples/cross-check-console/server/validate-response.test.mjs), [Command-line request cases](../tests/fixtures/validator-cli/README.md) |
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
| form-focus | Focus movement to the affected row after row operations | implemented | passed | not-deployed | [Browser interaction checks](operations/verification.md) |
| form-markup | Recursive form nodes, list/detail display blocks, row cards and interface messages in five implementations | implemented | passed | not-deployed | [Form markup](spec/form-markup.md), [display formats](spec/display-formats.md) |
| crudui-details | Read-only detail specification, model, framework-independent HTML rendering and structure validation | implemented | passed | not-deployed | [Specification](spec/schema.md), [display formats](spec/display-formats.md), [feature contract](spec/feature-contracts.md), [shared detail fixture](../tests/fixtures/detail-render/README.md), [native comparison](../tests/native-generators/README.md), [detail validity cases](../tests/fixtures/detail-validity/cases.json) |
| form-view-state | Row collapse and merged undo history outside record data | implemented | passed | not-deployed | [Node tests](../packages/generator-core/src/node.test.ts) |
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

The current OrderedJSON monorepo revision and five implementation packages passed
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
browser CSS checks. Cross-check rendering passed 33 cases. The cross-check gateway suite
passed 359 tests, including all 64 shared form-validation fixtures through JavaScript,
PHP, Go and Rust. Its rendering fan-out covers all 92 form, 42 list and 30 detail fixtures;
the one public-instance form fixture with a generated row identity is checked by parity and
row-key contract rather than fixed bindForm bytes.

The executable conformance matrix checks the declared target groups, fixture inventories, gateway
test links and native operation surfaces. It runs as part of `npm run test:runtimes` and fails when
an implemented feature is declared without corresponding target coverage.

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

Candidate `e1bb6f2055532b46301285e20758d073d1cbb432` uses one committed source
archive and verifies its commit and SHA-256 digest before extraction. The source
archive SHA-256 is
`34ac7c5ee13b311001920cd3ac7a86d86076122db6c5b96438439e25872c40a6`.
Image `localhost/crudui-form-comparison:e1bb6f205553` has index digest
`sha256:e0fa7f38083e002b7abd1e989ac743843cab3a474d7dd732925ccf54d8289b5b`.
Image construction passed 152 source checks and 10 library checks. The image
passed the Chromium process check as the application user and started one PHP,
PHP extension, Go and Rust server from that archive.

Generation and SSR passed 450 of 450 checks across 899 HTTP requests, including the
built frame document, the SSR form HTML with its record payload and the rejected SSR
requests of every server. Persistence and validation passed 120 of 120 checks, and each
PHP mode passed 62 generation checks. The browser aggregate passed 1,216 scenario
checks, 5,376 initialization comparisons, 320 interaction checks, 32 mount-before-load
checks and 64 frame-document checks with zero failures. PHP completed in 340,871
milliseconds, the PHP extension in 306,669 milliseconds, Go in 276,126 milliseconds and
Rust in 265,581 milliseconds. Every server completed below the 900,000 millisecond
limit. The aggregate records `complete: true`, `passed: true`, `failedChecks: 0` and
`performancePassed: true`. The browser aggregate, generation report and server
report SHA-256 values are respectively
`58d68d091d647a2160c1dffd93288b8c3e8ac5eb507f5f18cc190779be681c08`,
`8d26bb7b8b5ff4731e71718425cd4f57ad716ef56ae6c5010fd25c7d4716c295` and
`7898bbb381f265ae885c6eb413ada7f4c54ebd72ea186f9038549977225fed40`.
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

The current deployment reuses the running comparison container when its image and
mount contract match. Source synchronization preserves container inspection,
project routes, proxy state, certificates, stored files, HTML, health and load
responses. Container creation is limited to bootstrap or an explicit image/mount
contract change.

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
