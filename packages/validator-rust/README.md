# formspec-validator (Rust)

Rust validator for the form-spec system. Ships the v1 binary (`validate`) and the
v2 engine (compose → forbidden-scan → validate), kept in conformance lockstep
with the JS/PHP/Go implementations. The v1 model is never touched by v2 (R7
parallel run).

## v2 CLI — `validate-v2` bin (`src/bin/validate-v2.rs`)

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the Rust wrapper:

```
cargo run --bin validate-v2 < request.json
```

- stdin: `{"spec": {...}, "data": {...}, "files"?: {...}, "basepath"?: "...", "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form` (`v2::validate::validate_v2`: compose → forbidden-scan
→ DATA validate). `list` runs `v2::list::validate_list` (SPEC §9): compose +
forbidden-scan only — a list carries no rows, so `data` is ignored. Distinct
exit codes separate a bad request (exit 1, `{"error"}`) from a compose LOAD
failure (exit 2, `{"error", "code", "at"}`); a LOAD failure is never
`valid:false`.

## Test

```
cargo test                                 # full suite
cargo test --test validate_v2_cli_conformance   # v2 CLI conformance
cargo test --test list_validity_conformance      # list structure conformance
```
