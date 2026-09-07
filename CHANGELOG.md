# Changes

[한국어](CHANGELOG.ko.md).

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
