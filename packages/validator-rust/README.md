# formspec-validator (Rust)

Rust validator for the form-spec system. Ships the legacy binary (`validate`) and the
CRUDUI engine (compose → forbidden-scan → validate), kept in conformance lockstep
with the JS/PHP/Go implementations. The legacy model is never touched by CRUDUI (R7
parallel run).

## CRUDUI CLI — `validate` bin (`src/bin/validate.rs`)

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the Rust wrapper:

```
cargo run --bin validate < request.json
```

- stdin: `{"spec": {...}, "data": {...}, "files"?: {...}, "basepath"?: "...", "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form` (`CRUDUI::validate::validate`: compose → forbidden-scan
→ DATA validate). `list` runs `CRUDUI::list::validate_list` (SPEC §9): compose +
forbidden-scan only — a list carries no rows, so `data` is ignored. Distinct
exit codes separate a bad request (exit 1, `{"error"}`) from a compose LOAD
failure (exit 2, `{"error", "code", "at"}`); a LOAD failure is never
`valid:false`.

## Test

```
cargo test                                 # full suite
cargo test --test validate_cli_conformance   # CRUDUI CLI conformance
cargo test --test list_validity_conformance      # list structure conformance
```
