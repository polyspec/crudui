# CRUDUI list-render shared fixture (3-framework parity gate, schema §9)

The read sister of `tests/fixtures/form-render/`. One `expected_html` per list
scenario; React/Vue/Svelte each SSR-render the SAME list spec + injected rows and
must reproduce `expected_html` AFTER the shared normalizer
(`tests/fixtures/form-render/normalize.mjs` — reused verbatim, SPEC §9 plan).

`list` is the read sister of `form-spec` (`create = write`): it shares the CRUDUI
engine 100% (compose / expression / i18n / design node maps). The ONE new surface
is the read cell renderer (`@form-spec/generator-core` `cell.ts`). DB-agnostic:
`rows` are INJECTED in the fixture; `search` / `sort` / `pagination` are DECLARED
only — the server applies the real query, the spec declares (SPEC §6 R1, §9.1).

## Files

- `cases.json` — generated. One case `{ name, note, spec, rows, options?,
  expected_html?, expectError? }`. `expected_html` is the NORMALIZED output of the
  React CRUDUI list reference generator (`renderList`). Do NOT edit by hand.
- `generate.ts` — the generator. Regenerate after a contract change:
  ```
  node_modules/.bin/tsx tests/fixtures/list-render/generate.ts \
    > tests/fixtures/list-render/cases.json
  ```

## Consumers (per-framework parity tests)

- React: `packages/generator-react/src/__tests__/current-list-parity.conformance.test.ts`
- Vue: `packages/generator-vue/test/list-render.conformance.test.mjs`
- Svelte: `packages/generator-svelte/test/list-render.conformance.test.mjs`

Each renders every non-error case through its framework's `renderList*` and
asserts `normalizeHtml(actual) === expected_html`. Error cases assert the surfaced
`ComposeLoadError` (an unresolved `$ref` is a LOAD ERROR, never a silent table).

## Canonical list markup contract

The normalized markup is identical across React/Vue/Svelte:

- envelope `<div class="list-view {design}">`
- toolbar `<div class="list-actions"><span class="list-action" data-action="K">…</span></div>`
  (link action → `<a>`, bare behavior → `<button>` with the verbatim `on*` script)
- table `<table class="list-table">`
  - head `<th class="list-th" data-field data-sortable data-sort-dir>`
    `<span class="list-th-label">L</span>` + `<span class="list-sort">↕</span>` (sortable)
  - body `<td class="list-td list-td-TYPE">CELL</td>`
- cards `<div class="list-cards"><article class="list-card">`
  `<div class="list-td list-td-TYPE"><span class="list-card-label">L</span>`
  `<span class="list-card-value">CELL</span></div></article></div>`
- empty `<div class="list-empty">EMPTY</div>` (no `<table>`)
- pagination `<nav class="list-pagination" data-mode data-per-page data-page data-total>`

### §9.2 cell catalog display

| format | normalized cell body |
|---|---|
| text / date / number / choice-label | escaped string |
| badge | `<span class="badge badge-VARIANT">LABEL</span>` |
| link | `<a href="…" target="…">TEXT</a>` |
| image | `<img src="…" alt="…" width height>` |
| bool `as=check` | `<span class="bool-check" aria-label="L">✔/✘</span>` |
| bool `as=icon` | `<span class="bool-icon bool-true|false" aria-label="L"></span>` |
| bool `as=text` | `<span class="bool-text">L</span>` |
| html | verbatim raw markup (the ONE sanctioned raw passthrough, no wrapper) |
