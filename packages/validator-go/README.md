# validator-go

Go validator for the crudui system. Ships the legacy validator (`cmd/validate`)
and the CRUDUI engine (`validator/CRUDUI`: compose → forbidden-scan → validate), kept in
conformance lockstep with the JS/PHP/Rust implementations. The legacy model is never
touched by CRUDUI (R7 parallel run).

## CRUDUI CLI — `cmd/validate`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the Go wrapper:

```
go run ./cmd/validate < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"|"detail"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form` (`ValidateJSON`: compose → forbidden-scan → DATA
validate). `list` runs `ValidateListJSON` (SPEC §9): compose + forbidden-scan
only — a list carries no rows, so `data` is ignored. `detail` runs
`ValidateDetailJSON`: the detail root and its `fields` map are composed and
forbidden-scanned the same way, and `data` is ignored. An absent `mode` selects
`form`.

Request rules, checked in this order; each failure exits 1 with stdout exactly
`{"error": <message>}`:

1. stdin is not valid JSON → `Request must be valid JSON`
2. the request is not a JSON object → `Request must be an object`
3. `spec` absent or not an object → `Request spec must be an object`
4. `mode` present and not exactly `form`, `list` or `detail` (`null`, `""` and
   non-strings included) → `Unsupported validation mode`
5. `files` present, not `null` and not an object → `Request files must be an object`
6. any `files` member not an object → `Request files must contain objects`
7. `basepath` present, not `null` and not a string → `Request basepath must be a string`

Absent or `null` `files`/`basepath` mean none. In `form` mode an omitted `data`
member validates `{}`; a present `data` that is not an object (`null` included)
is the input failure `{"error": "Form data must be an object", "code":
"INVALID_FORM_INPUT", "at": ""}`. A load failure (unresolved `$ref`/`$patch` or
forbidden meta key, `*compose.ComposeLoadError`) or an input failure
(`*validate.FormInputError`) exits 2 with exactly `{"error", "code", "at"}`,
never `valid:false`. Every language's CLI uses this contract.

## Test

From the repository root:

```sh
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...               # full suite
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./validator/...     # CRUDUI conformance
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./cmd/validate/     # CRUDUI CLI conformance (form + list + detail)
```
