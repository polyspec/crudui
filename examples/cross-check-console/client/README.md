# Cross-Check Console — client

Single-page, no-build console that drives the cross-check gateway. Plain ES
modules; the only runtime dependency is `js-yaml`, loaded via importmap from a
CDN (drop a local copy at `./vendor/js-yaml.mjs` and add it to the importmap to
run offline). No bundler, no transpile step — the gateway serves this directory
statically at `/`.

## What it does

The console flows arbitrary spec + data through the gateway's two endpoints in
parallel, then judges agreement itself and exposes the raw responses so its own
judgement can be re-checked.

- `POST /api/validate` `{spec, data, files?, basepath?}` → 4-language CRUDUI
  validation (`js` / `php` / `go` / `rust`). Each entry:
  `{lang, ok, valid, errors[{path,field,rule,message,value}], ms, loadError}`.
  `loadError` (unresolved `$ref`, forbidden key) is distinct from `valid:false`.
- `POST /api/validate-list` `{listSpec, files?, basepath?}` → 4-language CRUDUI list
  STRUCTURE validation (compose → forbidden-scan; no rows — a list has no data).
  The validate sister of `/api/validate`: same per-entry envelope, a forbidden
  meta key surfaces as the SAME `loadError`, a clean structure is `valid:true`.
- `POST /api/render` `{spec, data, options}` → 3-framework CRUDUI SSR
  (`react` / `vue` / `svelte`). Each entry:
  `{fw, ok, html, normalized, ms, error}`. `error` carries
  `REF_FILE_NOT_FOUND` / `UNSUPPORTED_FIELD_TYPE`.

Both endpoints always answer HTTP 200; a failed validation or a missing `$ref`
is data, not an HTTP error. The `{error}` envelope is reserved for transport /
server faults (4xx/5xx).

## On screen at startup

- Header: example selector (basic / complex / edge-ref / edge-unsupported /
  mismatch-slot), KO/EN language toggle (→ `options.language`),
  `unsupported` selector (`throw` / `marker`), `raw` toggle, doc button,
  fixture-export button.
- Left: YAML spec editor + JSON data editor, each with a green/red parse badge.
  A parse failure disables the run button.
- `검증 + 렌더 실행` button → `Promise.all` over both endpoints.
- Validate matrix: 4 columns (lang + ms), valid/invalid badge, error list
  (`field: message (rule)`), yellow `LOAD-ERROR` badge for `loadError`. A green
  `4언어 멱등 일치` badge when all 4 agree; red `결과 불일치!` + per-lang diff
  table + red borders on the divergent columns otherwise.
- Render matrix: 3 columns, sandboxed `srcdoc` iframe preview, toggle to raw
  HTML source, red `ERROR` badge for `error`. Green `3프레임워크 parity 일치`
  badge when normalized HTML agrees; red + diff table + red borders otherwise.
- `raw` toggle: every cell shows the server's verbatim JSON entry, so the
  console's idempotent/parity verdict can be audited against the source data.
- Collapsible doc panel: CRUDUI syntax summary (role slots, condition maps,
  compose, lang, design node map, independent-verification rationale).

## Features

- Matrix view (4× validate, 3× render).
- Self-computed idempotent (4 langs) + parity (3 frameworks) badges, derived
  from the raw per-entry results — not the server's own verdict.
- `raw` toggle to bypass the console's judgement and read source responses.
- In-page doc panel.
- Example specs quoted from `tests/fixtures/{validate,form-render}/cases.json`
  (no invented shapes), including two edge cases that should fail uniformly
  across all languages/frameworks and an empty "intentional-divergence" slot.
- Fixture export: serializes current spec/data/options + results into the
  `cases.json` shapes — validate `{name,note,spec,data,expected:{valid,errors}}`
  and form-render `{name,note,spec,data,options,expected_html}` — and downloads
  them. Paste an exported divergent case into the AI gate
  (`compare-all.js` / `*.conformance`) to turn a live break into a permanent
  regression test.

## Run

The gateway serves this directory statically. From the console root:

```
node ../server/server.mjs      # serves client/ at http://localhost:<port>/
```

Then open `http://localhost:<port>/`. For a split deploy, pass the gateway
origin: `http://localhost:5173/?api=http://localhost:8020`.

## Independent verification

The console and the AI gate reach the SAME CRUDUI engine functions
(`validate`, `renderForm`, `renderFormSSR`) through DIFFERENT call stacks:
the console via the HTTP gateway with free-form live input; the gate via
vitest / go test / cargo test / php worker with fixed fixtures. Same input must
yield the same result — when it does not, a wrapper bug surfaces. The `raw`
toggle keeps the console's own verdict auditable, and fixture export feeds live
breaks back into the fixed gate.
