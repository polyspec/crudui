# validator-go

Go validator for the polyspec system. Ships the v1 validator (`cmd/validate`)
and the v2 engine (`validator/v2`: compose → forbidden-scan → validate), kept in
conformance lockstep with the JS/PHP/Rust implementations. The v1 model is never
touched by v2 (R7 parallel run).

## v2 CLI — `cmd/validate-v2`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the Go wrapper:

```
go run ./cmd/validate-v2 < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form` (`ValidateJSON`: compose → forbidden-scan → DATA
validate). `list` runs `ValidateListJSON` (SPEC §9): compose + forbidden-scan
only — a list carries no rows, so `data` is ignored. A compose LOAD failure
(unresolved `$ref`/`$patch` or forbidden meta key) is reported as a fatal
`{"error": ...}` envelope on stdout, never `valid:false`.

## Test

```
go test ./...                              # full suite
go test ./validator/v2/...                 # v2 conformance
go test ./cmd/validate-v2/                 # v2 CLI conformance (form + list)
```
