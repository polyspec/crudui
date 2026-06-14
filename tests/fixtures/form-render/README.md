# form-render shared fixtures (3-framework parity gate)

`cases.json` is the single shared fixture for the CRUDUI SSR renderer. All three
generators (React / Vue / Svelte) load this one file and must reproduce each
case's `expected_html` AFTER passing through the shared normalizer
(`normalize.mjs`). Do not fork per framework. Do not edit `cases.json` by hand —
regenerate it (see Generation).

The pipeline under test is the four mandated stages: CRUDUI spec → CRUDUI compose
(`validator-js` CRUDUI compose: expand `$ref`/`$patch` into a single spec) → design
slot + condition-map render (the SAME expr engine the CRUDUI validator uses) → SSR
HTML. The compose and expr engines are REUSED from `validator-js` (no duplicate
implementation); no legacy meta key (`display_switch`/`display_target`/
`element_class`/`group_class`/`wrapper_class`/…) and no `eval` are involved.

## Case shape

Root is an array. Each case:

```jsonc
{
  "name": "design-show-expr-falsy",       // unique id
  "note": "human description",            // intent
  "spec": { "type": "group", "properties": { /* CRUDUI field specs */ } },
  "data": { /* form data (expr engine formData + value source) */ },
  "options": {                            // optional render options
    "language": "ko",                     // active content language
    "keyPrefix": "...",                   // name/id prefix
    "files": { "Base.yml": { "properties": { /* ... */ } } } // $ref file set
  },
  "expected_html": "<div class=\"form-group\">…</div>",  // NORMALIZED reference output
  "expectError": { "code": "REF_FILE_NOT_FOUND" }        // OR: a render load error
}
```

A case has EITHER `expected_html` (success) OR `expectError` (an unresolved
`$ref` etc.) — never both. `expectError` cases prove SPEC §5/G5: an unresolved
composition is a LOAD ERROR (render fails), never `valid:true`.

## Three-framework contract

For each success case: `normalize(generator.render(spec, data, options))` ==
`expected_html`, for React, Vue, and Svelte. For each `expectError` case: the
render throws `ComposeLoadError` with the recorded `code`.

## Normalization rules (`normalize.mjs`)

The normalizer erases what is NOT load-bearing across frameworks while keeping
the load-bearing structure (tag tree, attribute presence + values, text):

- **N1 uniqid mask** — every generated Limepie token `__<11..16 hex>__` →
  `__UNIQID__`, wherever it appears (`data-uniqid`, and placeholder/array row
  keys inside `name="...[__hex__]"`). Only token LENGTH is contractual; the value
  is a per-render counter. Real data row ids (e.g. `p1`, a server PK / G4 data
  identity) are NOT this shape and survive unmasked.
- **N2 attribute order** — attributes within a tag are sorted by name.
- **N3 empty-value attrs** — `x=""` is kept (presence is load-bearing).
- **N4 empty class/style** — `class=""` and `style=""` are dropped (no-op chrome).
- **N5 whitespace** — whitespace between `>` and `<` is removed; inner runs
  collapse to one space; leading/trailing trimmed.
- **N6 self-closing** — ` />` / `/>` normalize to `>`.

## Coverage (22 cases)

- `design.show` expression (truthy → shown, falsy → wrapper `display: none` with
  DOM kept — the legacy non-removal contract).
- `design.show` condition map (`{ '.role == "admin"': true, true: false }`):
  declaration-order resolve, `true` fallback last.
- `design.class` condition map on the main node; `design.class` ternary
  (`.vip ? gold : plain`, regex-misread guard).
- `design` 4-node map (label/wrapper/group/prepend) — each node carries its own
  class; the target node is visible in the key (R8).
- `design: false` — slot off, no appearance, default envelope.
- legacy `group_class` exist/empty → `design.group.class` condition map (data-driven
  `.form-group` class branch).
- `multiple: true` with multi-row data (2nd row `clone-element`) + plus/minus;
  empty data → single placeholder row.
- `multiple: { max, sortable, copy }` bucket → `data-multiple-max`, move-up/down,
  copy + `btn-delete` (canonical keys only; legacy `multiple_max`/`sortable`/
  `multiple_copy` are NOT recognition keys).
- `multiple` group rows: real data id preserved (G4), no `__13hex__` position id
  leakage.
- `lang: true` (default ko/en/ja/zh language children + lang-code prepend span);
  `lang: { only, title, frame:false }` bucket.
- group nested `properties` (recursive children).
- `$ref` + deep-path `$patch` composition (compose runs first); unresolved
  `$ref` → `ComposeLoadError` (render fails).
- content `LangMap` translation (label switches with `language`), independent of
  the `design.show` appearance axis (G3 two axes).
- `behavior` opaque pass-through (`onchange` attr verbatim, NOT through the expr
  engine) — the contrast to `design.show` which IS evaluated.

## Generation

`expected_html` is the React CRUDUI reference generator's real output — never
hand-written. Regenerate:

```sh
# from repo root
node_modules/.bin/tsx tests/fixtures/form-render/generate.ts > tests/fixtures/form-render/cases.json
```

`generate.ts` imports `renderForm` from
`packages/generator-react/src/index.ts`, renders every scenario, normalizes
with `normalize.mjs`, and dumps the JSON. The conformance test
(`packages/generator-react/src/__tests__/form-render.conformance.test.ts`)
re-verifies the React engine against the dumped fixture.
```
