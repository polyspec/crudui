# CRUDUI Rust validator

[한국어](README.ko.md).

The `crudui-validator` package is version `0.0.1`. The library exports form
validation through `crudui_validator::validate::validate`, list validation
through `crudui_validator::list::validate_list` and detail validation through
`crudui_validator::detail::validate_detail`. The current CLI is `validate`;
the separate legacy CLI is `validate-legacy`.

## CLI

Run from `packages/validator-rust`:

```sh
cargo run --bin validate < request.json
```

Input is a JSON object with `spec`, optional `data`, `files`, `basepath` and
`mode`. The default mode is `form`. Form validation composes the specification,
checks forbidden keys and validates data. The `list` mode checks list structure
and the `detail` mode checks detail structure; both ignore `data`. Any other
`mode` value, including a non-string JSON value, returns
`{"error": "Unsupported validation mode"}` with exit status 1.

A completed validation returns `valid` and `errors`. Each validation error
contains `path`, `field`, `rule`, `message` and `value`. An omitted `data` member
validates `{}`. In form mode a present `data` that is not an object, `null`
included, is an input failure with code `INVALID_FORM_INPUT`.

Request errors return exactly `{"error": MESSAGE}` with exit status 1 and are
checked in this order:

1. stdin is not valid JSON: `Request must be valid JSON`
2. the request is not an object: `Request must be an object`
3. `spec` is absent or not an object: `Request spec must be an object`
4. `mode` is present and not `form`, `list` or `detail`, `null` and non-string
   values included: `Unsupported validation mode`
5. `files` is present, not `null` and not an object: `Request files must be an object`
6. a `files` member is not an object: `Request files must contain objects`
7. `basepath` is present, not `null` and not a string:
   `Request basepath must be a string`

Absent or `null` `files` and `basepath` mean none. A
load failure (`ValidateError::Load`) or input failure (`ValidateError::Input`,
data with the wrong shape) returns exactly `error`, `code` and `at` with exit
status 2. A failure is not a data validation result. Every language's CLI uses
this contract.

## Checks

From the repository root:

```sh
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test validate_cli_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test list_validity_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test detail_validity_conformance
```
