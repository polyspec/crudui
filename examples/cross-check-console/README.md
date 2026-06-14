# Cross-Check Console

A single Node gateway that runs the SAME v2 engine the AI conformance gate runs,
through a DIFFERENT call stack, so a human can flow arbitrary spec + data live and
watch all four validators and all three SSR generators agree (or diverge).

Three responsibilities in one process (`server/server.mjs`):

- `POST /api/validate` — 4-language v2 validation fan-out. ALL FOUR languages (JS
  included) run as stdin-JSON CLI subprocesses (the v2 wrappers, not the v1 ones):
  compose → forbidden-scan → validate. The gateway imports NO validator — it is a
  pure orchestrator with zero privileged path, so the four are fully symmetric.
- `POST /api/render` — 3-framework v2 SSR. React / Svelte (sync) and Vue (async)
  all render in-process through the v2 entries the conformance tests import (the
  Svelte adapter compiles `.svelte` files, so a bundler-free CLI is impossible —
  but all three frameworks load the same way, so the render side is symmetric too).
- static console — serves `client/` at `/` (no build; plain ES modules).

## Why it is independent verification

The conformance gate (`tests/runner/compare-all.js` + the three
`v2-render.conformance` tests) drives the v2 engine through vitest / go test /
cargo test / a php worker against FIXED fixtures. The console drives the SAME v2
functions through an HTTP gateway against FREE live input. Same engine, different
wrapper — a bug in one path cannot hide a bug in the other. Removing the JS
in-process import strengthens this: JS now runs through a CLI exactly like
PHP/Go/Rust, so no language is favored inside the gateway and a 4-language
agreement is engine determinism, not a privileged-call-path artifact. The console computes
its own `idempotent` / `parity` verdict AND exposes the raw per-language /
per-framework bytes (raw toggle) so the verdict itself is auditable. A live
divergence you find can be exported as a fixture case and folded back into the
gate as a permanent regression test.

## Endpoints

```
POST /api/validate   { spec, data, files?, basepath? }
  → 200 { results:[{lang,ok,valid,errors,ms,loadError}], idempotent, mismatch }

POST /api/render     { spec, data, options:{language,unsupported} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

GET  /health         → 200 { status:"ok", timestamp }
GET  /               → static console (client/)
```

`spec` may be a YAML string OR an already-parsed object; both are accepted.
Validation/render FAILURE is never an HTTP error — it is a result surface (always
200). An unresolved `$ref`/`$patch`/forbidden key is a LOAD failure (`loadError` /
`error` with a stable `code`), distinct from `valid:false`. Only real server
faults use 4xx/5xx with `{ error }`.

## Run

The Go and Rust v2 validators are subprocess CLIs that must be compiled first.
The JS v2 validate CLI (`packages/validator-js/bin/validate-v2.mjs`) runs the
TypeScript v2 source through the `tsx` loader (`node --import tsx`) — no separate
build, but `tsx` must be installed (it is a workspace devDependency; run
`npm install` at the repo root once). The three generators load from TypeScript
source via an in-process Vite SSR loader at gateway startup.

```bash
# 1. PHP deps (once)
cd packages/validator-php && composer install && cd -

# 2. tsx for the JS v2 CLI (workspace devDependency)
npm install                  # at repo root, installs tsx + js-yaml + vite/svelte

# 3. build the Go + Rust v2 CLIs (the server expects them at fixed paths)
cd examples/cross-check-console/server
npm run build:cli            # = build:go + build:rust
#   go build -o ../../../packages/validator-go/validate-v2 ./cmd/validate-v2
#   cargo build --release --bin validate-v2  (in packages/validator-rust)
npm run check:js-cli         # smoke-test the JS v2 CLI (node --import tsx)

# 4. start the gateway (boots the v2 render engine, then serves)
npm start                    # PORT=4000 by default
```

Open http://localhost:4000 — pick an example, edit spec/data, hit run.

## Local curl smoke test

```bash
# validate: conditional required fires → all 4 langs invalid@email:required
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"subscribe":{"type":"checkbox"},"email":{"type":"email","validate":{"required":".subscribe"}}}},"data":{"subscribe":true,"email":""}}'
# → idempotent:true, every lang valid:false with required@email

# validate: unresolved $ref → LOAD error in all 4 langs (NOT valid:false)
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"$ref":"Missing.yml"}},"data":{}}'
# → idempotent:true, every lang loadError.code REF_FILE_NOT_FOUND

# render: email field → 3 frameworks parity, normalized == fixture expected_html
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"email":{"type":"email","label":{"ko":"이메일","en":"Email"}}}},"data":{},"options":{"language":"ko"}}'
# → parity:true

# render: unsupported field type with unsupported:"throw" → 3 frameworks error
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"x":{"type":"totally-unknown-widget"}}},"options":{"unsupported":"throw"}}'
# → parity:true, every fw error.code UNSUPPORTED_FIELD_TYPE
```

## Layout

```
server/
  server.mjs          gateway: routes + CORS + always-200 + static serving
  engine.mjs          one Vite SSR boot → loads the 3 v2 RENDER entries (render only)
  validate-runner.mjs all 4 langs via spawnSync CLI (zero privileged path); idempotency verdict
  render-runner.mjs   React/Svelte/Vue in-process SSR; parity verdict
  package.json        start + build:cli + check:js-cli scripts
client/               no-build console (index.html + app.js + styles.css)
```

The v2 validate CLI wrappers live in their own packages (JS
`bin/validate-v2.mjs`, PHP `bin/validate-v2.php`, Go `cmd/validate-v2`, Rust
`src/bin/validate-v2.rs`). v1 is never touched.
