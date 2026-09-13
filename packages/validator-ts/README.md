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
- `FormInputError` — submitted data with the wrong shape (`INVALID_FORM_INPUT`).

An unresolved `$ref`/`$patch` or a forbidden meta key is a `ComposeLoadError`
(a load failure). Root data that is not an object, group data that is not an
object and repeated data that is not a keyed object throw `FormInputError`. Neither
failure is `valid:false`; the
[validation procedure](../../docs/operations/validation.md) defines the messages.

## CRUDUI CLI — `bin/validate.mjs`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the JS wrapper:

```
node --import tsx bin/validate.mjs < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form`. `list` runs `validateList` (structure only; `data`
is ignored). An omitted `data` member validates `{}`. A load or input failure
exits 2 with exactly `{"error", "code", "at"}` (no `valid` key); a malformed
request is `{"error"}` with exit 1. Every language's CLI uses this contract.

## Test

```
npm test            # full suite (vitest)
npm run test:current     # CRUDUI conformance only (src/CRUDUI)
```
