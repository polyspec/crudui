# CRUDUI Rust validator

[한국어](README.ko.md).

The `crudui-validator` package is version `0.0.1`. The library exports form
validation through `crudui_validator::validate::validate` and list validation
through `crudui_validator::list::validate_list`. The current CLI is `validate`;
the separate legacy CLI is `validate-legacy`.

## CLI

Run from `packages/validator-rust`:

```sh
cargo run --bin validate < request.json
```

Input is a JSON object with `spec`, optional `data`, `files`, `basepath` and
`mode`. The default mode is `form`. Form validation composes the specification,
checks forbidden keys and validates data. The `list` mode checks list structure
and ignores `data`.

A completed validation returns `valid` and `errors`. Each validation error
contains `path`, `field`, `rule`, `message` and `value`. An omitted `data` member
validates `{}`. Invalid request syntax returns an `error` with exit status 1. A
load failure (`ValidateError::Load`) or input failure (`ValidateError::Input`,
data with the wrong shape) returns exactly `error`, `code` and `at` with exit
status 2. A failure is not a data validation result. Every language's CLI uses
this contract.

## Checks

```sh
cargo test
cargo test --test validate_cli_conformance
cargo test --test list_validity_conformance
```
