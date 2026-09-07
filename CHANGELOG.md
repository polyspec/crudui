# Changes

[한국어](CHANGELOG.ko.md).

## 2026-09-07 — Focus during native typing

Ignore unchanged input/change events before capturing focus. A native change
event during input replacement previously cleared the pending focus state in
Vue and Svelte, so typing stopped after the first character.

Verification: Chrome retained the complete typed value and input focus in Vue
and Svelte using the changed source. Core type checking passed. Full comparison
verification is pending. Deployment: packages not published.

## 2026-09-07 — Focus after adding to an empty collection

The browser binding identifies the empty collection's Add button by its wrapper.
After the first row replaces that button, it restores focus to the Add button in
the same collection with `preventScroll`.

Verification: the shared mounted DOM scenario passed in React, Vue and Svelte;
core type checking passed. Real browser verification is pending. Deployment:
packages not published; the comparison example still uses its previous source snapshot.

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
