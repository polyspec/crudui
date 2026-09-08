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
go test ./validator/...                 # CRUDUI conformance
go test ./cmd/validate/                 # CRUDUI CLI conformance (form + list)
```
