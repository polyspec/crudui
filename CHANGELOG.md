# Changes

[한국어](CHANGELOG.ko.md).

## 2026-09-13 — Bind repeated rows from keyed objects only

`bindForm` in TypeScript, PHP, Go, Rust and the C PHP extension creates repeated
rows only from keyed objects. Missing collection data creates one row keyed
`__0000000000000__`. An array, null or scalar collection fails with
`INVALID_FORM_INPUT` and the message `Repeated data must be a keyed object:
{path}`. Field paths no longer carry `#N` array-position segments, so the
position helpers were removed from all five implementations. Go's unused
`rowPosition` function was removed. The shared form fixture uses keyed data, and
the HTML conformance suite now includes the former array cases.

`npm run test:forms` passed (core 88, HTML 112, React 701, Vue 344, Svelte 345,
normalizer 10). `make test-native` passed 786 generator checks, including new
checks that require identical rejection code, message and path in all five
implementations. `make docs-check` passed.

## 2026-09-13 — Align repeated-row declarations across schema, validators and CLI

`multiple.min` is declared in the TypeScript, Go and Rust specification models,
accepted by the PHP `multiple` bucket and reported by `crudui explain` and
`crudui describe`. The PHP bucket previously rejected `min`, although the JSON
schema and form runtime define it. `multiple.copy` is a boolean in the JSON
schema; the object form had no runtime meaning. Model comments describe keyed
row identity instead of hidden identifiers and array order.

Schema checks (58 cases), TypeScript validator tests (1606), PHP validator
tests (1446), Go and Rust validator tests, CLI tests (37) and `make docs-check`
passed.

## 2026-09-13 — Add framework-independent HTML rendering and executable feature contracts

`@crudui/generator-html` renders current form and list view models as HTML
fragments without framework dependencies. It supports table and card lists,
current field shapes, widget layouts, escaping rules and raw display content;
browser event binding remains in `@crudui/generator-core`.

`contracts/features.json` now records package exports, feature contracts,
fixtures, test files, support status and verification commands. The manifest
schema and path checker reject missing links. `manifest:test` executes the
declared verification commands, and feature contract pages are generated from
the manifest. CI runs the manifest checks and commands before form tests.

The HTML renderer passed 110 package tests, including 87 form conformance cases
and 20 list conformance cases. Public package exports, declarations, consumer
builds, API documentation and `make docs-check` passed. The package is not
deployed.

## 2026-09-12 — Publish static documentation through GitHub Pages

The documentation build supports `DOCS_BASE_PATH` and generates explicit static
HTML links for English, Korean and API documents. Development, preview and 404
pages use the same URL prefix. CI checks documentation,
then deploys the generated site to `https://polyspec.github.io/crudui/` from
`main`.

`make docs-check` and `make docs-verify-idempotent` passed with
`DOCS_BASE_PATH=/crudui/`. Browser checks passed for desktop and mobile layouts,
Korean navigation, stylesheets and nested 404 pages.

## 2026-09-11 — Name the comparison deployment command explicitly

The local comparison deployment entry point is now named
`examples/form-comparison/comparison-deployment.mjs`. Verification procedures,
examples and tests use the explicit comparison deployment name.

## 2026-09-11 — Make native C fixtures compile with Linux toolchains

`packages/php-ext/tests/engine.test.mjs` now links `libm` when compiling native
fixtures and emits cleanup statements separately from guard clauses. The C
engine fixtures compile with the warning-as-error settings used by the PHP 8.4
and 8.5 CI jobs.

## 2026-09-11 — Build JavaScript prerequisites before native tests

`make test-native` now builds the workspace JavaScript packages before running
the C extension engine tests. The native test target provides the built React
generator package required by the engine rendering fixtures in a clean checkout.

## 2026-09-11 — Complete the independent C PHP extension

The PHP extension now implements its form and validation engine in C. The
engine owns ordered values and performs composition, expression evaluation,
template compilation, data binding, form and list rendering, validation, row
operations and PHP value conversion inside the extension process. The package
no longer contains a Cargo manifest, Cargo lock file or Rust source. The direct
builder compiles the complete C source set, and the form-comparison extension
stage no longer copies a Rust toolchain. The comparison generator check hashes
the root package lock file used by the candidate source archive.

The C engine checks passed 29 of 30 tests on macOS, with the Linux-only address
sanitizer test skipped. The module build and load succeeded; PHP API checks
passed 352 cases in each of three configurations and validation passed 94 cases
in each implementation. `make test-native` passed with 766/766 generator
checks, 19 protocol checks, all PHP, Go and Rust package checks, and the widget
and timezone checks. `npm run test:form-comparison` passed 136 source, 10
library and 3 browser-job checks. `make docs-check` passed. The extension and
comparison service are not deployed.

## 2026-09-11 — Render form fields in C

The C extension renders evaluated form fields as server HTML. The renderer
supports leaf, group, repeated and language field structures and all current
widget layouts. It preserves control attribute order, opaque event attributes,
raw display content and script and style elements. Text, attributes, URL values
and final CSS properties use the current rendering rules. Rendering does not
change the evaluated field models.

Focused C checks matched exact HTML for all 90 successful shared form fixtures
and two additional escaping and CSS cases. The same cases passed with strict C11
compiler warnings and undefined-behavior instrumentation. These changes are not
deployed.

## 2026-09-11 — Bind form fields in C

The C extension binds compiled templates to record data without changing either
input. Binding resolves presentation rules, translated content, repeated rows,
language fields, checkbox state and widget models. Explicit empty arrays and
objects produce zero repeated rows, while an omitted repeated value produces one
initial row. Unsupported field types return `UNSUPPORTED_FIELD_TYPE` unless the
caller selects the explicit marker result.

The widget implementation generates complete button and editor scripts and keeps
ordered model members. Focused C checks matched the complete ordered field models
for all 91 compilable shared form fixtures, confirmed input immutability and
completed the same cases with undefined-behavior instrumentation. These changes
are not deployed.

## 2026-09-11 — Evaluate form expressions in C

The C extension resolves object and array paths and evaluates literals, relative
paths, wildcards, comparisons, membership, boolean operations and ternary
expressions. Condition maps select the first matching declaration and use an
explicit `true` entry as the default. The implementation uses standard C11.

The focused C check passed all 38 shared expression specifications and their 77
evaluation cases with strict compiler warnings. The cases cover expression
values and boolean results. These changes are not deployed.

## 2026-09-11 — Compile form templates in C

The C extension composes explicit in-memory files, applies ordered references and
patches, detects reference cycles and returns composition error codes and traces.
Form compilation produces data-independent templates containing the template
kind, optional key prefix and recursively compiled fields. Field specifications
do not retain nested `properties`.

Focused C checks passed all 20 shared composition cases and compiled all 92 shared
form fixtures with the same ordered templates or errors as the JavaScript
implementation. The C sources compile with strict C11 warnings. These changes are
not deployed.

## 2026-09-11 — Add the C extension value model

The C extension engine stores nulls, booleans, integers, finite numbers, UTF-8
strings, arrays and ordered objects without PHP or Rust data structures. Values
own their strings, object keys and children. Copy, replacement and removal keep
object declaration order and produce independent values. Invalid UTF-8 and
nonfinite numbers are rejected.

The focused C test verifies ordering, replacement, deep copies, arrays, UTF-8 and
numeric equality. It passed with strict C11 compiler warnings and undefined
behavior checks. The macOS memory inspector reported zero leaks. The independent
C extension source check excludes declared build output and continues to reject
Rust source and Cargo files in the package. These changes are not deployed.

## 2026-09-11 — Use the Node.js 24 artifact action

Native PHP 8.4 and 8.5 CI jobs upload their comparison reports with
`actions/upload-artifact@v7`. This action declares the Node.js 24 runtime. The
previous action declared Node.js 20, so GitHub-hosted runners replaced its runtime
and reported a deprecation warning. Report names, paths, hidden-file inclusion and
missing-file failure behavior remain unchanged.

The CI configuration regression suite requires the current artifact action and
passed all four checks. These changes are not deployed.

## 2026-09-11 — Enforce npm 12 and sandboxed Chrome CI

The npm dependency policy permits a URL dependency only when the root manifest
declares it directly and pins it to an immutable source revision. Dependency
verification rejects URL dependencies introduced by another dependency. Package
consumer verification reads the current npm 12 `pack --json` report and requires
exactly one report for the requested package and archive.

Linux browser CI uses the regular Chrome file at `/opt/google/chrome/chrome` and
disables Puppeteer's browser download. The preflight rejects symbolic links in the
browser path, launches Chrome without sandbox-disabling arguments and requires
`chrome://sandbox` to confirm the active first-layer, PID, network and Seccomp-BPF
sandboxes. Both browser CI jobs complete this preflight before starting tests.

GitHub Actions run `34551049527` for commit
`a7ac873b5a2e47c398372a50ab8fb31a75823393` completed all 20 jobs successfully.
The run includes package consumer, public export and type, repeated build, browser
inspector and CSS, form-comparison regression, documentation coverage and PHP 8.4
and 8.5 native generation and PHP API checks. No job failed or was cancelled.
These changes are not deployed.

## 2026-09-11 — Verify clean CI installations

Repository-root form-comparison and cross-check commands declare their direct
JavaScript dependencies in the root manifest. Form comparison uses the root npm
graph, and the cross-check renderer resolves Vite and the Svelte plugin by package
name. Package consumer verification packs each package from its own directory and
requires one archive result.

The form-comparison CI job installs PHP 8.5 and the validator and generator
Composer graphs before running the complete suite. Native PHP matrix jobs pass
the regular versioned `php-config` path for the selected PHP release. Artifact
upload runs only after native verification creates the report.

A clean source archive passed 136 form-comparison source checks, ten generator
construction checks and three Chromium browser checks. Package consumer export,
type, production build and three-framework browser verification passed. Public
package checks passed nine cases, repeated builds passed one case, and the form
inspector passed 18 unit and six browser CSS checks. Cross-check rendering passed
33 cases. These changes are not deployed.

## 2026-09-11 — Preserve Svelte editable controls

The Svelte generator renders ordinary input and textarea controls as stable DOM
elements. Session value updates retain each element, focus and text selection.
Controls with string `on*` behavior attributes and controls that require exact
specialized HTML remain on the raw serialization path.

The browser connection formats date and datetime values from the current form
instance before updating live controls. Initial data and later injection use the
same value conversion.

Regression checks cover text, email, number, password, textarea, date and datetime
controls. The Svelte SSR and HTML comparison suite passed 345 checks, the mounted
browser suite passed ten checks, the generator core passed 86 checks and
`svelte-check` reported zero errors and warnings. This change is not deployed.

The complete `make test-native` command returned status 0. The run passed 11
extension build checks, 160 PHP generator tests, all Go package tests, 20 Rust
generator tests, 352 PHP API checks in each of three configurations, 94 validation
cases in each PHP implementation, 19 protocol checks, the 766/766 generator report
and five Chromium widget and timezone checks. The generator report SHA-256 is
`16ab371b3691429ca4e2c1a3eaa3c35fb7209861abd5759f16efea6c1a19aa5d`.

## 2026-09-11 — Verify explicit browser and PHP inputs

The Chromium widget check disables Vite dependency discovery and optimizes only
the five declared React and CRUDUI packages. It fails on page exceptions, HTTP
error responses, failed requests and `console.error` messages during every test
phase. The five widget and timezone checks passed.

The PHP form server reads the `crudui/validator` installation directory from
the selected generator vendor's `composer/installed.php`. Other registered
Composer installations do not affect package selection. The directory must be
inside the selected vendor directory. Every path component and loaded class file
must be regular, and the installed validator file must match the candidate source
file. A missing or malformed selected record, an external path or a changed
package copy fails construction.
The startup health check accepts `Generator` and `Form` only from the generator
source directory and `Validator` only from the selected Composer package copy.
It rejects the repository validator source path. A rejected health response
reports the server and the first response field that failed verification.

The PHP source and construction suite passed ten checks. Five hundred verified
constructions completed within the 250 millisecond limit. The PHP and PHP
extension integration check passed 125 generation checks in each mode together
with JSON conversion, storage, validation, public signature and processor-mode
checks. The form comparison build command passed 131 source checks and ten
construction checks.

Candidate source tests create writable fixtures under the canonical operating
system temporary directory. Every temporary path component must be a regular
directory and must not be a symbolic link. Candidate tests do not require Git
metadata or write under the extracted source directory. The candidate fixture
location regression check and all ten PHP construction checks passed.

## 2026-09-11 — Build PHP extensions directly

One PHP extension builder compiles and loads the CRUDUI and OrderedJSON
modules. Separate entry points declare each module's sources, outputs, platform
libraries and load checks. Candidate images use both entry points and do not run
`phpize`, Autoconf or libtool.

The builder resolves regular `php-config`, C compiler, Cargo and rustc files
before compilation. It rejects relative paths, symbolic links, missing or
ambiguous tools and mismatched PHP installations. Rustup identifies the regular
Cargo and rustc files in one selected toolchain. Cargo receives the regular
rustc and linker paths explicitly. Generated path cleanup validates every
declared target before removal and does not follow symbolic links.

The direct builds loaded both modules on PHP 8.5.10. The combined process called
both modules successfully. The PHP API check passed 352 checks in each of three
configurations and 94 validation cases in each implementation. Six builder and
entry-point regression checks passed.

## 2026-09-11 — Use explicit browser completion signals

The form-comparison runner subscribes to the main-page and frame readiness
messages before navigation. The interaction and typing verifiers reserve each UI
operation before activation and await that operation's completion. React and
Svelte complete synchronous updates with `flushSync`; Vue publishes `nextTick`
completion. The verifiers read DOM results only after renderer completion. They
do not use periodic DOM reads, network-idle inference or fixed rendering delays.

The documentation development server registers its recursive file-system
subscription before the initial build. It excludes generated `docs/.site/`
events, serializes rebuilds and combines source events received during one build
into one additional build. A build failure is reported and the next source event
can request another build. A file-system subscription failure closes the server
with status 1.

The candidate verification procedure runs one commit-specific lifecycle command.
The command prepares and builds the candidate, subscribes to its readiness file
before startup, runs the HTTP and browser checks sequentially and retains only
verified deployment evidence. The procedure does not use a sleep interval or a
readiness retry loop.

The form-comparison source suite passed 129 checks, the generator construction
performance suite passed four checks and the browser job suite passed one check.
The documentation suite passed 15 checks. A development-server check returned
HTTP status 200, rebuilt once for one source event and returned status 0 after
`SIGINT`.

## 2026-09-11 — Resolve the native Cargo command path

The `test-native` target supplies its expanded `PATH` when it starts Cargo. GNU
Make 3.81 now resolves Cargo from the directory added by the Makefile when that
directory is absent from Make's startup environment. A regression check runs the
target with simulated commands and places Cargo only in the added directory.

The regression check and all eight runtime policy checks passed. The complete
`make test-native` command returned status 0 with PHP 8.5.10 and passed 160 PHP
tests, all Go package tests, 20 Rust tests, 19 protocol checks, the 766/766
generator report and three Chromium widget and timezone checks.

## 2026-09-11 — Verify local comparison deployment

The repository verifies candidate metadata, generation, persistence, browser
reports, the exact local image tag and image digest before generating the local
comparison Compose file. Deployment preserves existing data without overwriting
different files. HTTPS verification uses the explicit containerctl certificate
authority and checks the source commit, route, certificate, data mount, stored
files and response bytes. A second identical application must leave every checked
value unchanged.

Successful deployment removes candidate containers, candidate directories, raw
reports, screenshots, previous deployment results and local comparison images
that the deployed service does not use. Eleven deployment cleanup checks and all
96 form-comparison source checks passed.

The checks include failed and stale evidence, exact report totals, deterministic
Compose output, data preservation, certificate authority loading, identical
reapplication changes and cleanup path boundaries. Deployment has not been
performed for this change.

## 2026-09-10 — Declare native test dependencies

Repository-root build and test entry points declare every directly imported
third-party package in the root manifest. The dependency check reads the Node.js
entry points executed by `make test-native` and rejects undeclared imports. The
widget script check resolves Vite 8.2.2 from the root dependency instead of a
transitive installation.

All six dependency checks passed. The complete `make test-native` command returned
status 0 with PHP 8.5.10 and passed 160 PHP tests, all Go package tests, 20 Rust
tests, 19 protocol checks, the 766/766 generator report and three Chromium widget
and timezone checks.

## 2026-09-10 — Enforce dependency install-script approvals

Each independently installed npm graph records exact-version approvals for all
dependency lifecycle scripts. Workspace packages use the root lock file. Clean
installs in CI and container builds use `--strict-allow-scripts` and fail before
installation when an approval is missing.

The dependency checks passed five of five tests across every tracked lock file.
The three browser applications built successfully, the parity suite passed seven
of seven tests, the runtime policy and package-build suites passed seven of seven
tests each, and the complete documentation check passed.

## 2026-09-10 — Current candidate verification

The cross-framework and legacy-client lock files resolve the current package
releases allowed by their manifests. Clean `npm ci` and `npm audit` runs reported
zero vulnerabilities. The cross-framework comparison passed 14 of 14 checks, and
the legacy-client comparison passed 5 of 5 checks.

Candidate `757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd` built image
`localhost/crudui-form-comparison:757f144b9c4b` with index digest
`sha256:7842bd0a40f1e51d4c975008a9b5bdaf6d148e9faba05e68faf3a935b02fe2c7`.
Image construction passed 81 source checks and four library checks. Runtime
verification passed both PHP modes, 290 generation and SSR checks across 411 HTTP
requests, 120 persistence and validation checks, and three Ordered JSON checks.

Browser verification passed 312 checks for each server and 1,248 checks in total.
PHP completed in 213,288 milliseconds, the PHP extension in 206,475 milliseconds,
Go in 200,691 milliseconds and Rust in 200,500 milliseconds. The aggregate records
`complete: true`, `passed: true`, `failedChecks: 0` and
`performancePassed: true`. Packages and the comparison service were not deployed.

## 2026-09-10 — Complete public TypeScript API types

Package entry points export every named type referenced by their public
TypeScript declarations. Form and list validation use one public file-set type.
TypeDoc validation warnings now fail API generation and documentation coverage.
Two unexported-type regression checks, six public declaration checks and the
isolated five-package consumer check passed.

## 2026-09-10 — Selected runtime channels

`.node-version`, CI and Node.js container stages select Node.js 26 as the next
LTS release line without fixing a patch release. `.go-version`, CI and Go
container stages select the Go 1.27 stable release line. Rust CI and container
stages select the stable Rust channel. CI installs the current stable npm
release. All six runtime policy checks passed. Package lock files continue to
record resolved package versions.

## 2026-09-10 — Four-server candidate verification

The candidate image verifies one committed source archive before extraction and
runs the complete source suite as the application user before starting PHP, the
PHP extension, Go and Rust servers. Image construction passed 81 source checks
and four library checks. Runtime verification passed the Chromium process check,
290 generation and SSR checks across 411 HTTP requests, 120 persistence checks
and all PHP processor-mode and Ordered JSON checks.

The browser aggregate passed 960 scenario checks, 240 interaction checks, 24
mount-before-load checks and 24 static-document checks. Every server completed
below the 900,000 millisecond limit. The aggregate recorded zero failures and
`passed: true`. Packages and the comparison service were not deployed.

## 2026-09-09 — CI package and documentation checks

The documentation CI job installs both PHP package dependency graphs before
running `make docs-check`. A package and browser job packs the five JavaScript
packages into an isolated consumer, verifies public exports, declarations and
styles, compares repeated build outputs, and runs the form inspector unit and
Chromium CSS checks.

The package consumer, public build, reproducible build and form inspector checks
passed locally. Native PHP output through the three framework browsers remains a
separate comparison-environment verification and was not established by this CI
change. No remote CI run or deployment was performed.

## 2026-09-09 — Current and retained comparison documentation

The feature status now separates implemented native packages from the pending
four-server integration. The verification procedure requires an explicit library
path and commit, distinguishes the current PHP, PHP extension, Go and Rust targets
from retained comparison modes, and documents the two native modules, generation
checks and SSR routes. Browser use of serialized server-compiled templates is
implemented; seven focused unit tests, the complete Go server package, four Rust
server tests and 12 React, Vue and Svelte frame production builds passed locally.
The candidate image's complete four-server HTTP, browser and storage verification
remains pending and not deployed. The retained running image was not replaced.

## 2026-09-09 — OrderedJSON implementation submodules

The processor checker uses the pinned OrderedJSON common repository and all five
implementation submodules. It uses the current registry API, PHP namespace and
extension name, and rejects changed sources, malformed output and incomplete
results. Reports record source, fixture and module hashes.

The official processor checks passed 575 cases; the CRUDUI checks passed all
50 cases. Five checker unit tests passed and two invalid source inputs were
rejected. These results verify JSON processing, not browser or storage integration.

## 2026-09-09 — Native form generators and common PHP APIs

PHP, Go and Rust provide form compilation, data binding, editable instances,
form and list HTML, CLI adapters and HTTP examples. The CRUDUI PHP extension
registers the same Generator, Form and Validator classes as the PHP packages.
Its C binding converts PHP values directly to statically linked Rust engines.
The implementations share ordered value conversion, UTC date rendering, CSS
declaration handling and widget control contracts.

The shared suite passed 153 checks for each of five implementations and one
input-hash check: 766 passed, zero failed. PHP API checks passed 352 cases in each
of three process configurations; PHP and native validation passed 94 cases each.
Form package tests, packaged consumer checks and documentation checks passed.

The full `make test-native` command passed in a new non-root Linux arm64 image
built from the current source snapshot. It rebuilt and loaded the extension, ran
the PHP, Go and Rust package tests, repeated the PHP API and validation checks,
passed all 19 protocol checks and all three Chromium widget and timezone checks,
and produced another complete 766/766 generator report. The image index digest is
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`;
the report SHA-256 is
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442`
and the run-log SHA-256 is
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`.
This establishes native package verification, not the separate four-server
comparison integration. No package publication or comparison deployment was
performed.

## 2026-09-09 — Validator CLI responses

The comparison console checks process exit status, JSON response types, all
five error fields and consistency between validity and errors. It preserves
returned values instead of filling missing fields or coercing invalid types.
Specification load failures must match the CLI's documented response and exit
status. Process failures and malformed responses fail comparison.

Eight initial regressions failed before the fix. All 116 console tests passed,
including 35 response checks and execution of the four language CLIs.
`make docs-check` passed. These are local checks; no deployment was performed.

## 2026-09-09 — Runtime package contracts

The runtime contract defines form generation, SSR and validation requirements
for JavaScript, PHP, Go, Rust and the PHP extension. The PHP API contract specifies
common `CRUDUI\Generator`, `CRUDUI\Validator` and `CRUDUI\Form` classes,
extension registration before Composer class loading, and matching methods.
The implementation proposal maps packages, source coverage and required checks.
Feature status distinguishes these requirements from implemented packages.

The comparison documentation identifies native JSON parsing separately from
native CRUDUI generation and validation. `make docs-check` passed.

## 2026-09-09 — Legacy translation identifiers

Internal translation variables describe the translated field or schema value.
The naming contract covers file names, public APIs and internal identifiers.
The validator package build, all 1,606 validator tests and `make docs-check` passed.

## 2026-09-09 — CLI dependency build

CLI CI builds the validator package before running tests. Local instructions
include the same prerequisite, and documentation checks include the CLI README
and its Korean translation.

Removing validator output reproduced the missing-package failure. Rebuilding it
passed all 37 CLI tests, the four documented commands and two failure exit-code
checks. `make docs-check` passed.

## 2026-09-09 — Dependency update procedure

Scheduled dependency update pull requests are disabled. Dependency updates are
prepared locally and include the applicable package and documentation checks.
`make docs-check` passed.

## 2026-09-09 — Comparison environment verification

All four HTTP targets passed 120 current browser scenarios and 30 current
interaction checks each at `83181c2`, with no page errors. The image at
`dfe70a6` installs locked PHP dependencies and passed 240 HTTP checks and PHP
processor-mode checks. The external Compose environment serves local HTTPS
through `containerctl`; repeated `up` calls passed eight state and response
comparisons. English and Korean procedures describe the environment lifecycle.

## 2026-09-09 — Dependency installation and generated outputs

PHP CI jobs install dependencies from `composer.lock`. The PHP `vendor/`
directory and the compiled Go CLI executable are excluded from Git. Consumer CI
jobs build all required form packages, and the legacy comparison job runs its
regression checks. CI comments and step labels describe the commands actually run.

A clean Composer installation reproduced all 26 dependency versions and source
references. PHP passed 1,418 tests; four-language legacy comparison passed 1,074
cases; the cross-check console passed 81 tests. Documentation checks passed.

## 2026-09-09 — Public API descriptions

Public form and list API comments describe the current operations and error
results. The runtime contract uses form-instance terminology; legacy validator
examples import the explicit legacy entry. Removed an unused Vue type import and a reference to a nonexistent
options type. The five edited files produce identical executable JavaScript.
Package exports, strict consumer types, production rendering and repeat-build
checks passed.

## 2026-09-09 — End-date field references

TypeScript, PHP and Rust preserve `enddate` field-reference parameters, matching
Go. Dotted start-date paths no longer become boolean conditions that skip date
comparison. TypeScript and PHP use the common resolver for relative references.
The earlier-end-date regressions failed before the fixes. Seven shared cases
verify absolute, sibling and parent references and dates before, equal to and
after the referenced date. TypeScript
passed 1,606 tests, PHP passed 1,418 tests, and Go and Rust package suites passed.

The current rule contract is maintained in English and Korean under `docs/spec/`.
It replaces the mixed current/legacy rule document and separates registration,
parameter evaluation and verification evidence.

## 2026-09-09 — Legacy comparison correctness

The comparison runner loads the explicit JavaScript legacy entry and rebuilds
selected Go and Rust legacy executables. It rejects process failures, unreadable
suites and results that differ from fixture expectations. Source-loading and
developer-home fallbacks are removed. Two failure regressions failed before the
fix and passed afterward. All four implementations passed 1,074 legacy cases.
Default test commands include the runner regressions. English and Korean testing
instructions distinguish current conformance from legacy comparison.

## 2026-09-09 — Test fixture contract

The English and Korean fixture contract distinguishes current validation,
composition, expressions, rendering and legacy cases. It documents complete
validation results separately from load failures and removes outdated counts
from the format specification. The current and legacy TypeScript conformance
checks passed 1,124 cases. Documentation checks and the strict site build passed.

## 2026-09-09 — CLI composition failures and documentation

`check` reports unresolved composition instead of checking uncomposed input as a
substitute. The missing-reference regression failed before the fix and passed
afterward; all 37 CLI tests passed. The English and Korean CLI guide describes
the four registered commands. Package descriptions no longer list unimplemented
commands, and the unimplemented MCP proposal is removed.

## 2026-09-09 — Schema documentation consolidation

Current schema and expression contracts use their existing authoritative documents.
A separate English and Korean legacy schema describes the explicit legacy field
model. The duplicate root schema and condition-parser documents are removed;
references use the appropriate current or legacy contract. The legacy example
passed valid-input and custom required-message checks.

## 2026-09-09 — Legacy visibility contract

The English and Korean legacy visibility contract separates validator conditions
from renderer presentation. It documents map-form renderer processing and links
to the current schema's independent visibility and validation settings. The
duplicate visibility guide is removed. The selected TypeScript legacy
display-switch checks passed 84 cases.

## 2026-09-09 — Documentation site navigation

The site uses English navigation with a Korean index link. Generated API navigation
includes the shared generator core. Documentation checks, the strict site build
and generated navigation destination checks passed.

## 2026-09-09 — Data validation guide

The validation guide documents the current JavaScript, PHP, Go and Rust entry
points with `validate` rules. It separates schema loading, input failures,
visibility and transport processing. The outdated API guide is removed and
navigation uses the English guide with a Korean translation. All four code
examples executed successfully and detected the expected required-input failure.

## 2026-09-09 — Svelte generated output

Git excludes Svelte's temporary `.svelte-kit` output. The 117 generated files are
removed from tracking. Building without the preceding directory passed, as did
packaged exports, consumer type checking, the production build and browser checks
for React, Vue and Svelte.

## 2026-09-09 — Public API documentation generation

API generation fails when a required tool fails or its output is missing.
TypeScript checks all five public package entries, including Svelte component
declarations. Go documents all validator packages. Rust and PHP HTML references
are included in the static site. The documentation procedure specifies required
tools; the duplicate procedure is removed.

Eight generator failure tests, documentation checks, Svelte's 345 server tests
and 3 mounted tests passed. Two complete documentation generations produced
identical output, including native HTML assets. The strict site build passed.

## 2026-09-09 — Documentation link validation

The site checks internal links during builds. TypeDoc generates relative links
and package index pages. Existing repository files outside the site resolve to
GitHub source URLs; missing files fail. Five link tests run in `make docs-check`.
The strict site build, document checks and generated HTML link checks passed.

## 2026-09-09 — Maintained documentation navigation

Historical evaluation and implementation-comparison reports are preserved in the
external verification workspace and removed from the documentation site. The
site links to the maintained expression contract. Documentation maintenance
instructions identify the current example index checked by `make docs-check`.
The document checks and static site build passed.

## 2026-09-09 — Shared AST evaluation for ternary parameters

Form appearance and TypeScript, PHP, Go and Rust validation parameters evaluate
complete ternary ASTs. Selected field paths, nested true branches and quoted
escapes no longer use separate string parsers. Three form regressions and one
validation regression failed before the fix and passed afterward. Six shared
validation cases cover path-valued and nested limits. Existing validation results
and expected form HTML remain unchanged. The class-name fixture now quotes its
string branches.

The expression contract is maintained in English and Korean under `docs/spec/`.
It documents current boolean conversion separately from required-input validation,
operator precedence and condition-map defaults. CLI descriptions use this contract.
All four validator suites, all form suites, 36 CLI tests and documentation checks
passed. These results do not update the preserved external browser comparison.

## 2026-09-09 — Current API and fixture descriptions

Console documentation uses the current rendering API name. Composition and
rendering fixture descriptions state their behavior without implementation-version
labels. All 23 targeted composition tests passed; fixture inputs and expected
results are unchanged.

## 2026-09-09 — Independent historical comparison workspace

Historical comparison applications, pinned sources, build inputs and reports are
preserved in an independent external workspace. Package tests use repository-local
form inspection and JSON order checks. All 50 JSON order cases and the complete
form test suite passed after separation.

## 2026-09-09 — Reusable form inspector

The form inspector and its Node and browser checks are maintained under
`tests/form-inspector/`. Framework initialization tests use that module directly.
All 18 Node checks and six browser checks passed after relocation.

## 2026-09-09 — Bundled example specifications and nested data

The Bootstrap example includes product and repeated-form specifications in its
static build. Controlled pages apply complete form data instead of assigning
dotted paths as top-level keys. The application build and browser checks for
contact, registration, product and repeated forms passed, including nested
product data and rejection of an unintended dotted key.

## 2026-09-09 — Controlled legacy React updates

Legacy form change notifications execute outside React state updater functions.
Consecutive field changes preserve prior values and notify the controlled parent
once per change. The regression failed before the fix. All 692 React tests and
the package build passed after the fix.

## 2026-09-09 — Legacy example layout and builds

Legacy examples use `examples/legacy`. Imports, package references, build contexts,
tests and documentation use the relocated paths. Container builds install and
build the complete workspace through package commands. PHP integration classes
use individual PSR-4 files. The Node example lock file reflects current manifests.

Local frontend builds, Go tests, Rust compilation, five PHP API checks and Node
HTTP valid/invalid cases passed. Composer strict PSR-4 generation and documentation
checks passed. Linux images for the frontend examples, Node, PHP, Go and Rust built.
All four server images passed valid and invalid HTTP cases. PHP Apache routing
and its document root passed. Frontend browser verification remains pending.

## 2026-09-09 — Repeated-field schema

The declaration schema accepts `multiple.min` and describes collection-key row
identity without hidden fields. Schema validation passed 56 fixtures, including
minimum-count acceptance and rejection of a nonnumeric minimum.

## 2026-09-09 — Current comparison image

The comparison image builds library source `a5b4491` with normal dependency
installation. The image installs the browser archive extractor and resolves
native JavaScript build dependencies through the workspace lock file.
The local comparison environment runs PHP, PHP extension, Go and Rust.
All 240 HTTP checks and PHP processor-mode checks passed. Browser comparison
is in progress for this source and dependency graph.

## 2026-09-09 — Dependency installation and package checks

The workspace lock file resolves declared dependency ranges and includes native
packages for supported platforms. The root declares Vitest for shared test
integration. npm install-script approvals identify reviewed package versions.
The isolated consumer uses normal installation with the same script approvals.

Clean installation, public package checks (5), repeated build comparison (1),
consumer types, production compilation and three-framework browser checks passed.
Form checks passed: core 26, React 691, Vue 344, Svelte 345 and 3 mounted checks,
and 6 HTML normalizer checks. JavaScript validation passed 1,579 tests.
These results do not establish deployment of the comparison environment.

## 2026-09-09 — Field error descriptions

Unsupported field errors identify the field type and path. Current test names
use unversioned operation names. Core checks passed: 26 tests. Documentation
checks passed.

## 2026-09-09 — Independent PHP extension target

PHP extension execution uses a separate process, repository and server identifier.
The native processor is required in extension mode and prohibited in PHP mode.
Server and browser checks include PHP extension as a fourth target.

An isolated container passed 240 HTTP checks across four targets, including
processor-mode assertions. Both PHP codec modes and rejection of missing or
unexpected extensions passed. Full extension browser verification remains pending.
The main comparison container has not yet been replaced with this image.

## 2026-09-09 — Empty collection browser checks

Browser checks locate the collection containing the focused button through its
field wrapper. The current renderer no longer uses wrapper name attributes.
All 18 current empty-collection checks passed across three servers, three
frameworks and both transports. The PHP run passed all six current initialization
comparisons and 30 current-runtime pointer/keyboard interaction checks
(108 across all comparison modes), with no page errors.
Retained source HTML differences remain recorded as failures.

## 2026-09-09 — Shared SSR comparison instance

The cross-check console creates one form instance for the three renderers.
Generated row keys are identical across framework outputs when repeat data is
missing. Console checks passed: 81 tests, including the generated-key comparison.

## 2026-09-09 — Comparison server entries

Current PHP, Go and Rust servers use unversioned validator entries. Retained
Go and Rust servers build from a pinned server-source archive. The comparison
container uses library source `30ff267`. All 180 HTTP persistence checks passed.
Browser lifecycle verification is in progress. No package was published.

## 2026-09-09 — Comparison browser entries

Comparison browser builds select current and retained source entries explicitly.
Current collection checks use field paths. The build requires an explicit
absolute workspace path. All twelve browser bundles built successfully.
Server integration and lifecycle verification remain pending; the running
comparison environment has not been replaced.

## 2026-09-09 — Public declaration builds

TypeScript package builds generate JavaScript with the bundler and declarations
with the TypeScript compiler. Public entries include the declared legacy exports.
Declaration compilation uses `noEmitOnError` and no deprecated-option suppression.
Watch commands regenerate declarations after successful JavaScript builds.

Verification: clean installation and the full build passed. Five public package
checks passed, including strict ESM/CommonJS type consumption, stylesheet output
and rejection of invalid public declarations. Two complete builds produced
identical output paths and SHA-256 digests. An isolated packaged consumer passed
type checking, production build and three-framework browser checks. Runtime
source files were unchanged by this build change. Packages were not published.

## 2026-09-08 — Form instances and input controls

The form API prepares templates with `compileForm`, creates editable instances
with `createForm`, renders `Form` components and accepts an instance in
`renderForm`. List renderers use the same `layout` option. Native controls have
stable, scoped label identifiers; multiple-choice controls submit arrays.
Field containers use `data-field-path` instead of a submission name.
Svelte packages include generated component declarations. Package dependencies
use the `0.0.1` package version. Validation comparisons fail when a required
engine fails, is missing or returns duplicate results.

Verification: 1,409 form tests, 1,579 JavaScript validator tests, 1,392 PHP tests,
Go and Rust tests, 42 console tests, 18 inspector tests, Svelte type checking,
package consumer compilation/build and documentation checks passed.
The running comparison container has not been updated to this source.

## 2026-09-08 — Record restoration HTML

The shared DOM binding places an existing `checked` attribute after the input's
other attributes. Initial rendering and record restoration now use the same
attribute order without replacing the input. The shared regression compares the
complete restored HTML and verifies that checkbox elements remain unchanged.

Verification: the stricter regression failed in React and Vue before the fix.
Generator builds, all 1,405 generator tests and 18 inspector tests passed after
the fix. Source `f4ec125` passed all 360 current-runtime scenarios across 18
server/framework/transport combinations. All 3,024 initialization, repeated
injection and restoration category comparisons passed, including 378 exact HTML
comparisons. The 24 previous restoration differences are resolved.

All 324 actual interactions, 36 mount-before-load checks, 36 static documents,
180 HTTP checks, 36 typing cases and six Chrome CSS detection checks passed.
Korean React and English Vue checks through Rust verified the inspector button,
all 168 categories per run and exact JSON/HTML downloads. No browser page errors
occurred. The complete matrix records 1,290 passed and 150 failed scenarios;
all remaining failures belong to retained sources and match their previous results.

An intermediate run recorded an additional CSS failure after a progress-monitor
connection changed the browser viewport. The monitor was removed, the viewport
change was reproduced separately, and the full matrix was rerun at 1680 × 1100
without an additional connection. Both runs and previous reports are retained.
All 2,160 exported HTML snapshots match the recorded strings. Deployment: the
local container uses `f4ec125`; all 52 example files, the DOM binding source and
served metadata match the verified source. No package was published.

## 2026-09-08 — Form initialization inspector

Added initial-data creation and post-mount injection comparison using the parsed
browser DOM, unmodified HTML, live/default controls, ordered fields, computed CSS,
focus and saved records. The inspector retains category failures and continues
through repeated injection, record replacement and the same row actions. The
example provides a separate check button and downloadable HTML and evidence.
Static HTML responses are checked independently from mounting before data loads.
React now removes the empty style attribute when resolved inline styles are removed.

Verification: generator builds, 1,405 generator tests, 18 inspector tests and six
Chrome CSS detection checks passed. At 15:35 UTC, all three API servers completed
72 reports containing 1,440 scenario results: 1,278 passed and 162 failed.
Current-runtime initial-data/post-mount comparisons passed in all 18 combinations
at 15 stages. Repeated injection passed, including raw HTML. Record restoration
retained 24 raw HTML attribute-order differences in React and Vue; all current
DOM, CSS, control, data, focus and persistence comparisons passed. Historical
renderer differences remain recorded. Each server runner returned status 1.

All 324 interactions, 36 mount-before-load checks, 36 static HTML checks, 180 HTTP
checks, 36 typing cases and 54 bilingual UI selections passed. No browser page
errors occurred. Exported 2,160 stage snapshots and retained the stopped 42-report
run. Browser protocol calls now execute one API server at a time. Complete report
JSON omits indentation because the indented DOM records exceed the runtime string
limit; snapshot content is unchanged. Deployment is the local Apple container at
`localhost:4317`; no package publication or remote deployment.

## 2026-09-07 — Empty collection merge

Merged the empty-collection correction into `main`, retaining stable row keys and
focus handling. Empty collection Add buttons have an accessible label in React,
Vue and Svelte. Six regression tests cover explicit empty values, missing data,
visibility and nested row order. The tests use the current root group contract.

The pinned correction source is included in `main` history, so preparing the
comparison from a full clone does not require a separate branch.

Verification: generator builds and 1,402 tests passed (core 25, React 689,
Vue 342, Svelte 345 and Svelte client 1). The regression tests use `compileForm`
and `bindForm`. Deployment: no package publication; the local comparison
continues to use its existing pinned sources.

## 2026-09-07 — PHP, Go and Rust form persistence

Added independent Go and Rust servers alongside PHP for native form and JSON
submission, existing CRUDUI validation, atomic JSON storage and hierarchy reload.
Each server and source revision uses its own repository. Go and Rust binaries
compile against the displayed validator revision. Node serves browser assets and
forwards request bytes. Shared fixtures define identical stored records.

The page selects the server and retains that selection when changing language.
Form fields follow the string contract, and multilingual titles accept the
specified `ko` and `en` fields. Invalid structures, reset requests, oversized
requests and invalid required values are rejected without changing records.

The 13:47 UTC browser report contains 72 reports and 1,368 scenario results.
Corrected original and current runtime each passed 19/19 for PHP, Go and Rust in
React, Vue and Svelte with both form and JSON transmission. All 324 interaction
checks and 36 mount-before-load checks passed with no browser page errors.
Unchanged original keyed diagnostics remain 17/19 and array diagnostics 15/19;
the complete runner returned status 1 for the 108 retained diagnostic failures.
All 180 shared HTTP checks, 36 typing checks, 54 bilingual UI selections,
JavaScript/PHP conversion checks, PHP repository checks, Go static analysis,
Rust Clippy and `make docs-check` passed. Earlier failed reports were preserved.

Deployment: local Apple container at `localhost:4317`, using PHP 8.4.24,
Go 1.27.0, Rust 1.98.0 and Node 26.8.1. No package publication or remote deployment.

## 2026-09-07 — Original-controller typing

The original example controller could overwrite newer input with an earlier
rendered value and temporarily lose focus when a framework replaced an input.
It now cancels superseded input renders and restores values and focus immediately
after React, Vue or Svelte commits the DOM. The fixed two-frame delay was removed.

Verification at 13:41 UTC: all 36 native keyboard cases passed across four
comparison variants, three frameworks and 0/10/50 ms character intervals.
Immediate and settled text, focus and caret checks passed; no browser page errors
occurred. Library source snapshots are unchanged. Deployment is the local Apple
container at `localhost:4317`; no package or remote deployment was published.

## 2026-09-07 — Form comparison naming and source references

Applied consistent CRUDUI example names to paths, source, documentation,
container commands and Git history. Updated historical source references after
rewriting commits. All 166 commits and 5,854 Git objects passed the naming audit.
Comparison library and test files retain their original content. Previous data,
reports and source archives were preserved outside the working tree.

Verification at 12:21 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both form and JSON transmission. All 108
interaction checks, 12 mount-before-load checks, JavaScript/PHP conversion checks,
both repository checks and `make docs-check` passed. No browser page errors
occurred. Unchanged original keyed diagnostics remain 17/19 and array diagnostics
15/19; the full runner returns status 1 for those recorded failures.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment.

## 2026-09-07 — Form and ordered JSON transmission

Each form can select native multipart or JSON transmission. Both formats run
the same existing JavaScript/PHP validation and repository save. The JSON path
uses ordered-json `deb1b354` for requests, responses and storage files. Separate
transport modules convert its values to form records while preserving the
13-character keys, document order and empty collection types. The container
build includes the pinned source and displays its archive hash.

Added complete lifecycle checks for both transmission choices, identical-data
storage comparisons and malformed JSON rejection. Actual browser requests verify
the selected Content-Type and JSON shape. Invalid browser values block both
formats; invalid direct requests preserve stored records. Required/optional and
display rules continue to use the existing validators.

Verification at 11:35 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both formats. All 108 real interaction checks,
12 mount-before-load checks, JavaScript/PHP conversion checks and both repository
checks passed. JavaScript, PHP, Go and Rust validation conformance and
`make docs-check` passed. No browser page errors occurred. Unchanged original
keyed diagnostics remain 17/19 and array diagnostics 15/19 in both formats;
their existing failures remain recorded and the complete runner returns status 1.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment. Comparison sources and previous reports remain available.

## 2026-09-07 — JSON processor contract verification

Added a reproducible check against ordered-json `deb1b354` for document member
order, nested 13-character row data and empty collection types. All five
implementations passed ten transport fixtures and the processor's 115 common
cases. The fixtures verify JSON representation; browser behavior and runtime JSON
integration did not change. The local comparison remains available.

## 2026-09-07 — Empty collection correction and browser validation

- Added corrected original source `78723bb` to the primary comparison with current
  runtime `b516226`. The unchanged original keyed and array diagnostics remain
  selectable with their actual failures.
- Connected the existing JavaScript validator before user submission. Invalid
  values stop transmission and display field errors; reload clears obsolete errors.
  PHP independently validates the same rules. No validator rules changed.
- Verified optional blank department storage, hidden required-field failures,
  empty collection visibility, nested and complete deletion, re-addition,
  native/JSON persistence, sibling IDs and parent relationships.
- Added real typing, invalid/valid request counts and empty-collection keyboard
  focus checks. Frame scenarios run sequentially to avoid focus interference.
  The runner preserves prior reports and screenshots before writing new results.

Verification at 10:15 UTC: both primary implementations passed 17/17 in React,
Vue and Svelte. All 54 interactions, 12 mount-before-load checks and both PHP
repository checks passed; no browser page errors occurred. The unchanged original
keyed diagnostic remains 15/17 and the array diagnostic remains 13/17, so the
complete runner returns status 1. Existing shared validation cases passed in
TypeScript, PHP, Go and Rust. `make docs-check` passed.
Deployment: local Apple container at `localhost:4317`; packages not published.
Comparison sources and historical reports remain available for review.

## 2026-09-07 — Focus during native typing

Ignore unchanged input/change events before capturing focus. A native change
event during input replacement previously cleared the pending focus state in
Vue and Svelte, so typing stopped after the first character.

Verification: full Chrome checks retained the complete typed value and input
focus in React, Vue and Svelte. Shared mounted DOM checks and core type checking
passed. Deployment: local comparison environment; packages not published.

## 2026-09-07 — Focus after adding to an empty collection

The browser binding identifies the empty collection's Add button by its wrapper.
After the first row replaces that button, it restores focus to the Add button in
the same collection with `preventScroll`.

Verification: the shared mounted DOM scenario and real Chrome empty-collection
keyboard checks passed in React, Vue and Svelte; core type checking passed.
Deployment: local comparison environment; packages not published.

## 2026-09-07 — Focus during row operations

Row button pointer activation preserves input focus. DOM synchronization restores
text selection and ancestor scroll positions with `preventScroll`. Keyboard
activation retains focus on an existing button. Generator builds and mounted DOM
checks passed in React, Vue and Svelte. Real browser pointer and keyboard checks
passed in all three frameworks. Deployment: running in the local form comparison example;
packages not published.

## 2026-09-07 — Browser comparison and PHP persistence

- Added an Apple container environment for React, Vue, Svelte and PHP at
  `localhost:4317`, with exact original and current Git source snapshots.
- Added a primary comparison using identical 13-character keyed data. The original
  public functions use an example row controller and cached binding; the current
  runtime uses its library session. Original library source remains unchanged.
- Added original-public-function cache preparation with `composeProperties`,
  serialized structure restoration and `buildField` binding. Both keyed adapters
  read a composition reference once and reject further loading after preparation.
- Added native PHP parsing, revision-specific validation, atomic JSON persistence,
  parent ownership, scoped saved-key application, deletion and independent reload.
  Invalid or truncated requests preserve stored records.
- Added ID order `[5, 7, 1]`, insertion as ID 8 and subtree copying as ID 9.
  Keyed JSON uses document member order without additional order or identity
  fields. Editing document order changes stored and rendered order.
- Separated populated row-operation fixtures from explicit empty-collection checks.
  The comparison preserves empty-rendering failures without filtering generated rows.
- Mounted each form before its initial PHP data request. Browser request inspection
  checks that nested inputs exist before the request continues.
- Retained the earlier hidden-field array diagnostic as a selectable example.
  Its hidden fields and lack of cached binding are example configuration choices.
- Added pointer, keyboard and checkbox checks, manual controls, data inspection,
  downloadable results, raw error details and matching English/Korean documents.
  Failure explanations identify example configuration and original renderer behavior.
- The browser runner returns status 1 for any failed check, incomplete result or
  browser error. Recorded diagnostic failures remain failures.

Verification: in each framework, the current runtime passed 17/17 scenarios,
original keyed binding passed 15/17, and the retained array diagnostic passed
13/17. Original keyed failures both concern explicit empty-collection rendering.
Cache binding passed in both keyed examples. All 27 interaction checks, nine
mount-before-load checks and both PHP repository checks passed. No browser page
errors occurred. The comparison runner returned status 1 for recorded failures.
[Feature status](docs/features.md) records the current code's results.
Deployment: local Apple container; packages not published and no remote deployment.
The comparison artifacts and historical results remain available for review.

## 2026-09-07 — Compiled forms and 13-character row keys

- Added immutable, JSON-cacheable form templates and separate data binding.
- Added editable sessions with late data injection and scoped nested row addition,
  copying, removal, ordering and saved sequence key updates. New row keys contain
  13 hexadecimal characters; saved sequence keys contain 13 padded decimal digits.
- Connected native inputs and row buttons in React, Vue and Svelte. Corrected
  checkbox data rendering, explicit empty defaults, formatted date synchronization
  and React FormBuilder data prop replacement.
- Extended keyed scalar and group collection validation in four languages, with
  five shared cases for error paths, uniqueness and minimum count.
- Removed the combined `buildForm` entry and obsolete render aliases. SSR source
  functions accept compiled templates.
- Updated form contracts and usage documents with English and Korean versions.
  Added link, translation and status checks and included generator-core API
  documentation in the existing coverage check. Removed outdated form-key and
  schema documents after consolidating current contracts under `docs/spec/`.
- Replaced developer checkout paths with repository-relative imports or required
  external input paths. Corrected fixture regeneration to update existing cases.

Verification: core 19 tests; React 689; Vue 342; Svelte 345 SSR/unit and 1 mounted
DOM test; TypeScript validator 1,579; PHP conformance 61; Go and Rust shared
validation conformance passed. These runs include 43 shared CRUDUI validation cases.
Console SSR 32 tests, CLI 35 tests, lint, type checking and `make docs-check`
passed. API generation, schema generation and the documentation site build
passed. Deployment: not deployed.

## 2026-09-07 — Schema generation

Removed the unnecessary `ignoreDeprecations: "6.0"` compiler setting because the
schema generator's bundled TypeScript compiler rejects it. TypeScript type
checking, schema generation with three example checks, and the documentation
site build passed. Deployment: not deployed.
