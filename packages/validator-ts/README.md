# @crudui/validator (JS/TS)

crudui validator for JavaScript/TypeScript. Ships the legacy `Validator` library
(form data → `{ valid, errors }`) and the CRUDUI engine (compose → forbidden-scan →
validate) reused by `@crudui/generator-core`.

## CRUDUI entry points

- `validate(spec, data, opts)` — full form pipeline: compose (G5: expand
  `$ref`/`$patch`) → forbidden-scan (§6) → validate the data rows (§3 + §2 G1).
- `validateList(spec, opts)` — read-sister STRUCTURE check (SPEC §9): compose
  + forbidden-scan over the list tree. Validates NO rows (a list has no data;
  rows are injected, DB-agnostic). A clean load returns `{ valid: true,
  errors: [] }`.
- `composeProperties`, `MemoryLoader`, `ComposeLoadError` — composition surfaces
  consumed by the generators.

An unresolved `$ref`/`$patch` or a forbidden meta key is a `ComposeLoadError`
(a LOAD failure), never `valid:false`.

## CRUDUI CLI — `bin/validate.mjs`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the JS wrapper:

```
node --import tsx bin/validate.mjs < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form`. `list` runs `validateList` (structure only; `data`
is ignored). A `ComposeLoadError` is emitted as `{"error", "code"}` with exit 1
(no `valid` key); a malformed request is `{"error"}` with exit 1.

## Test

```
npm test            # full suite (vitest)
npm run test:current     # CRUDUI conformance only (src)
```
