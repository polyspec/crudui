# Cross-Check Console

[한국어](README.ko.md).

A Node HTTP gateway runs the same CRUDUI entry points as the automated
conformance checks through a separate call stack. It accepts an arbitrary
specification and data, then displays agreement or differences across four
validators and three SSR generators.

Responsibilities in one process (`server/server.mjs`):

- `POST /api/validate` — 4-language CRUDUI FORM validation fan-out. ALL FOUR languages
  (JS included) run as stdin-JSON CLI subprocesses (the CRUDUI wrappers, not the legacy
  ones): compose → forbidden-scan → validate. The gateway imports NO validator — it
  is a pure orchestrator with zero privileged path, so the four are fully symmetric.
- `POST /api/validate-list` — 4-language CRUDUI LIST STRUCTURE validation fan-out. The
  validate sister of `/api/validate` (SPEC §9): the SAME four CLIs route on
  `mode:"list"` (compose → forbidden-scan over the list tree). A list carries NO
  rows (they are injected, DB-agnostic), so there is no DATA pass — `data` is
  omitted. A forbidden meta key surfaces as the SAME `failure` record.
- `POST /api/validate-detail` — 4-language CRUDUI DETAIL STRUCTURE validation fan-out.
  The four CLIs route on `mode:"detail"` (compose the root and `fields` map →
  forbidden-scan). A detail validation carries no record, so `data` is omitted.
- `POST /api/render` — 3-framework CRUDUI FORM SSR. React / Svelte (sync) and Vue
  (async) all render in-process through the CRUDUI entries the conformance tests import
  (the Svelte adapter compiles `.svelte` files, so a bundler-free CLI is impossible
  — but all three frameworks load the same way, so the render side is symmetric too).
- `POST /api/render-list` — 3-framework CRUDUI LIST SSR. The read sister of
  `/api/render` (SPEC §9): a list-spec + INJECTED rows fan out across the three
  List SSR entries. Every framework takes the same `options.layout` (`table` or
  `card`) as the list-render conformance tests do, so the three normalized outputs
  collapse to one parity key.
- `POST /api/render-detail` — 3-framework CRUDUI DETAIL SSR. A detail specification
  and one INJECTED record fan out across the three detail SSR entries
  (`renderDetail` of each generator package). React's SSR image preload links are
  stripped before comparison exactly as for lists. The record is passed verbatim,
  so a non-object record surfaces as `INVALID_FORM_INPUT` in all three.
- static console — serves `client/` at `/` (no build; plain ES modules).

## Why it is independent verification

The conformance checks (`tests/runner/compare-all.js` + the three
`form-render.conformance` tests, plus the list-render conformance and the
4-language list-structure conformance) drives the CRUDUI engine through vitest / go
test / cargo test / a php worker against FIXED fixtures. The console drives the
SAME CRUDUI functions through an HTTP gateway against FREE live input. Same engine,
different wrapper — a bug in one path cannot hide a bug in the other. Removing the
JS in-process import strengthens this: JS now runs through a CLI exactly like
PHP/Go/Rust, so no language is favored inside the gateway and a 4-language
agreement is engine determinism, not a privileged-call-path artifact. A live
reported difference can be exported as a fixture case and added to the
conformance suite as a regression test.

The console does NOT trust the server's verdict. For every run it recomputes
`idempotent` (4 langs agree) and `parity` (3 frameworks agree) from the raw
per-entry results, and exposes the raw per-language / per-framework bytes (raw
toggle) so its OWN judgement can be re-checked against the source data. See
[Console-side verdict re-computation](#console-side-verdict-re-computation).

## Endpoints

```
POST /api/validate      { spec, data, files?, basepath? }
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/validate-list { listSpec | spec, files?, basepath? }   # no data — a list has no rows
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/validate-detail { detailSpec | spec, files?, basepath? }   # no data — no record is validated
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/render        { spec, data, options:{language,unsupported} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

POST /api/render-list   { listSpec | spec, rows, options:{language,layout?} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

POST /api/render-detail { detailSpec | spec, record, options:{language,files?} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

GET  /health            → 200 { status:"ok", timestamp }
GET  /                  → static console (client/)
```

`spec` (and `listSpec`) may be a YAML string OR an already-parsed object; both are
accepted. For the list endpoints `listSpec` is the canonical key and `spec` is
accepted as an alias; for the detail endpoints `detailSpec` is canonical and `spec`
is the alias. A malformed YAML string or a missing specification is a 400. Validation/render FAILURE is never an HTTP error — it is a
result surface (always 200). An unresolved `$ref`/`$patch`/forbidden key is a load
failure, and root, group or repeated data with the wrong shape is an input
failure. Every validator CLI reports both with exit status 2 and exactly
`{ error, code, at }`; the gateway exposes them as `failure: { code, message, at }`,
distinct from `valid:false`. Only real server faults use 4xx/5xx with `{ error }`.

## Run

The Go and Rust CRUDUI validators are subprocess CLIs that must be compiled first.
The JS CRUDUI validate CLI (`packages/validator-ts/bin/validate.mjs`) runs the
TypeScript CRUDUI source through the `tsx` loader (`node --import tsx`) — no separate
build, but `tsx` must be installed (it is a workspace devDependency; run
`npm install` at the repo root once). The three generators load from TypeScript
source via an in-process Vite SSR loader at gateway startup.

```bash
# 1. PHP deps (once)
cd packages/validator-php && composer install && cd -

# 2. tsx for the JS CRUDUI CLI (workspace devDependency)
npm install                  # at repo root, installs tsx + js-yaml + vite/svelte

# 3. build the Go + Rust CRUDUI CLIs (the server expects them at fixed paths;
#    `npm test` runs this first, so tests always use the current sources)
cd examples/cross-check-console/server
npm run build:cli            # = build:go + build:rust
#   go build -o ../../../packages/validator-go/validate ./cmd/validate
#   cargo build --locked --release --bin validate  (in packages/validator-rust)
npm run check:js-cli         # smoke-test the JS CRUDUI CLI (node --import tsx)

# 4. start the gateway (boots the CRUDUI render engine, then serves)
npm start                    # PORT=4000 by default
```

Open http://localhost:4000 — pick an example, edit spec/data, hit run.

## Three tabs: form, list and detail

The console has three tabs over the six endpoints. The panels never share DOM;
switching only toggles which `<main>` is visible.

- **form tab** — `POST /api/validate` (4-language form validation) + `POST
  /api/render` (3-framework form SSR), fired in parallel. Spec editor + data
  editor, `unsupported` toggle, fixture export.
- **list tab** — three matrices stacked top-down so the tab reads as validate (4
  langs) → render (3 frameworks), mirroring the form tab:
  1. `POST /api/validate-list` — the 4-language list STRUCTURE validate
     (compose → forbidden-scan; no rows). Drawn through the SAME idempotency
     matrix the form tab uses; a forbidden meta key surfaces as the SAME
     `failure` cell.
  2. `POST /api/render` of `listSpec.search` — the embedded `search` slot IS a
     form-spec, rendered through the SAME form endpoint to prove it round-trips
     unchanged. The list renderers ignore the `search` slot (they read only
     columns / sort / pagination / empty / actions), so the SAME spec object is
     what the form endpoint receives. A list-spec with no `search` slot shows an
     idle note instead of a phantom result.
  3. `POST /api/render-list` — the 3-framework List SSR over the INJECTED rows.
     Columns / format / pagination are declared in the list-spec; the rows are a
     separate JSON editor (DB-agnostic). Drawn through the SAME parity matrix the
     form tab uses.

  The list-spec editor + rows editor each carry a green/red parse badge; a parse
  failure disables the list run button. The `search` form-spec reuse means the
  same `search(form-spec)` round-trips through the form endpoint that the form tab
  exercises directly.
- **detail tab** — two matrices, validate (4 langs) → render (3 frameworks):
  1. `POST /api/validate-detail` — the 4-language detail STRUCTURE validate
     (compose → forbidden-scan; the record is not validated), drawn through the
     SAME idempotency matrix.
  2. `POST /api/render-detail` — the 3-framework detail SSR over the injected
     record, drawn through the SAME parity matrix.

  The detail-spec YAML editor and the record JSON editor carry parse badges; a
  parse failure disables the run button. The record editor accepts any JSON value
  and sends it verbatim, so the renderers' own input error is visible. Examples
  quote `tests/fixtures/detail-render` and `tests/fixtures/detail-validity`.

## Console-side verdict re-computation

The server reports `idempotent` / `parity`, but the console NEVER trusts it. On
every run it recomputes both from the raw per-entry results, so the on-screen
badge is independently derived:

- `idempotent` (validate / validate-list) — a stable per-language signature
  (the complete failure record, or valid + sorted 5-field errors, numeric `value` collapsed so a
  Rust-f64-vs-int serialization never trips a false mismatch). A failed CLI
  (`ok:false`) carries a distinct signature and never silently agrees. Fewer than
  two languages ran → undetermined (null), not false.
- `parity` (render / render-list / search render) — a success framework signs with
  `html:<normalized>`, a failed framework with `error:<code>` (distinct
  namespaces, so a framework that throws while the others render IS a parity break,
  not silently dropped). Fewer than two frameworks rendered → undetermined (null).

A divergent run paints the offending columns red and draws a per-entry diff table
(which language/framework split on which path/rule or tag/attribute). The `raw`
toggle replaces every cooked cell with the server's verbatim JSON entry — raw wins
over every view — so the console's own verdict is auditable against the source.

## Fixture export

Each tab serializes its current run into the matching `cases.json` shape and
downloads it, one case per language/framework:

- form tab → `tests/fixtures/{validate,form-render}/cases.json` shapes: validate
  `{name,note,spec,data,expected:{valid,errors}}` (or `expectFailure:{code,message,at}`) and form-render
  `{name,note,spec,data,options,expected_html}` (or `{expected_error}`).
- list tab → `tests/fixtures/list-render/cases.json` shape:
  `{name,note,spec,rows,options,expected_html|expected_error}`. `spec` carries the
  list-spec verbatim (including a `search` slot if present); the list conformance
  reader ignores that slot exactly as the live renderers do.
- detail tab → `tests/fixtures/detail-render/cases.json` shape:
  `{name,note,spec,record,options,expected_html|expectError:{code,message}}`.

Add an exported divergent case to the automated checks (`compare-all.js` /
`*.conformance`) to retain it as a regression test.

## Local curl smoke test

```bash
# validate: conditional required fires → all 4 langs invalid@email:required
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"subscribe":{"type":"checkbox"},"email":{"type":"email","validate":{"required":".subscribe"}}}},"data":{"subscribe":true,"email":""}}'
# → idempotent:true, every lang valid:false with required@email

# validate: unresolved $ref → load failure in all 4 langs (NOT valid:false)
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"$ref":"Missing.yml"}},"data":{}}'
# → idempotent:true, every lang failure.code REF_FILE_NOT_FOUND

# render: email field → 3 frameworks parity, normalized == fixture expected_html
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"email":{"type":"email","label":{"ko":"이메일","en":"Email"}}}},"data":{},"options":{"language":"ko"}}'
# → parity:true

# render: unsupported field type with unsupported:"throw" → 3 frameworks error
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"x":{"type":"totally-unknown-widget"}}},"options":{"unsupported":"throw"}}'
# → parity:true, every fw error.code UNSUPPORTED_FIELD_TYPE

# validate-list: clean list STRUCTURE → all 4 langs valid:true (no data pass)
curl -s -X POST localhost:4000/api/validate-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"name":{"field":".name","label":{"ko":"이름","en":"Name"}}}}}'
# → idempotent:true, every lang valid:true (mode:list, compose → forbidden-scan)

# validate-list: unresolved column $ref in a list → load failure in all 4 langs
curl -s -X POST localhost:4000/api/validate-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"$ref":"Missing.yml"}}}'
# → idempotent:true, every lang failure.code REF_FILE_NOT_FOUND

# validate-detail: a forbidden meta key on a field → the same load failure in all 4 langs
curl -s -X POST localhost:4000/api/validate-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{"fields":{"name":{"field":".name","show_if":".admin"}}}}'
# → idempotent:true, every lang failure.code FORBIDDEN_META_KEY at fields.name.show_if

# render-list: 2 injected rows + a column → 3 frameworks parity on the same table
curl -s -X POST localhost:4000/api/render-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"name":{"field":".name","label":{"ko":"이름","en":"Name"}}}},"rows":[{"name":"Ada"},{"name":"Lin"}],"options":{"language":"ko"}}'
# → parity:true, normalized table == fixture expected_html

# render-detail: one injected record → 3 frameworks parity on the same definition list
curl -s -X POST localhost:4000/api/render-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{"fields":{"name":{"field":".name","label":{"ko":"이름","en":"Name"}},"status":{"field":".status","label":{"ko":"상태","en":"Status"}}}},"record":{"name":"<Ada & Lin>","status":"active"},"options":{"language":"en"}}'
# → parity:true, normalized <dl class="detail-view">… == detail-render basic-fields expected_html

# render-detail: non-object record → the same input error in all 3 frameworks
curl -s -X POST localhost:4000/api/render-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{},"record":[]}'
# → parity:true, every fw error.code INVALID_FORM_INPUT ("Detail record must be an object")
```

## Layout

```
server/
  server.mjs          gateway: routes (validate, validate-list, validate-detail, render, render-list, render-detail) + CORS + always-200 + static serving
  engine.mjs          one Vite SSR boot → loads the 3 CRUDUI form, list and detail RENDER entries (render only)
  validate-runner.mjs all 4 langs via spawnSync CLI (zero privileged path); validateAll + validateAllList (mode:list) + validateAllDetail (mode:detail); idempotency verdict
  render-runner.mjs   React/Svelte/Vue in-process SSR; renderAll + renderAllList + renderAllDetail; parity verdict
  package.json        start + build:cli + check:js-cli scripts
client/               no-build console (index.html + app.js + examples.js + doc.js + styles.css);
                      three tabs (form, list, detail) over the six endpoints
```

The CRUDUI validate CLI wrappers live in their own packages (JS
`bin/validate.mjs`, PHP `bin/validate.php`, Go `cmd/validate`, Rust
`src/bin/validate.rs`). legacy is never touched.
