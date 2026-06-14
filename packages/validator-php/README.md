# form-spec/validator (PHP)

PHP validator for the form-spec system. Ships the v1 validator (form data → spec
verdict) and the v2 engine (compose → forbidden-scan → validate), kept in
conformance lockstep with the JS/Go/Rust implementations.

## v2 CLI — `bin/validate-v2.php`

The cross-check gateway drives all four languages as symmetric subprocesses
(spawn, stdin JSON, utf-8). This is the PHP wrapper:

```
php bin/validate-v2.php < request.json
```

- stdin: `{"spec": <object>, "data": <object>, "files"?: {...}, "basepath"?: <string>, "mode"?: "form"|"list"}`
- stdout: `{"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}`

`mode` defaults to `form` (compose → forbidden-scan → DATA validate). `list`
runs the STRUCTURE check (SPEC §9): compose + forbidden-scan only — a list
carries no rows, so `data` is ignored. An unresolved `$ref`/`$patch` or a
forbidden meta key is a LOAD failure, emitted as an `{"error", "code"}`
envelope (never `valid:false`).

## Test

```
composer test          # full PHPUnit suite
composer test:v2       # v2 conformance only (tests/V2)
```
