# Changes

[한국어](CHANGELOG.ko.md).

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
