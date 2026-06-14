# @polyspec/validator (JS/TS)

polyspec validator for JavaScript/TypeScript. Ships the v1 `Validator` library
(form data → `{ valid, errors }`) and the v2 engine (compose → forbidden-scan →
validate) reused by `@polyspec/generator-core`.

## v2 entry points

- `validateV2(spec, data, opts)` — full form pipeline: compose (G5: expand
  `$ref`/`$patch`) → forbidden-scan (§6) → validate the data rows (§3 + §2 G1).
- `validateListV2(spec, opts)` — read-sister STRUCTURE check (SPEC §9): compose
  + forbidden-scan over the list tree. Validates NO rows (a list has no data;
  rows are injected, DB-agnostic). A clean load returns `{ valid: true,
  errors: [] }`.
- `composeProperties`, `MemoryLoader`, `ComposeLoadError` — composition surfaces
  consumed by the generators.

An unresolved `$ref`/`$patch` or a forbidden meta key is a `ComposeLoadError`
(a LOAD failure), never `valid:false`.

## v2 CLI — `bin/validate-v2.mjs`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the JS wrapper:

```
node --import tsx bin/validate-v2.mjs < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form`. `list` runs `validateListV2` (structure only; `data`
is ignored). A `ComposeLoadError` is emitted as `{"error", "code"}` with exit 1
(no `valid` key); a malformed request is `{"error"}` with exit 1.

## Test

```
npm test            # full suite (vitest)
npm run test:v2     # v2 conformance only (src/v2)
```
