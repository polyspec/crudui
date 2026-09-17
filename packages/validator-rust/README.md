# CRUDUI Rust validator

[한국어](README.ko.md).

The `crudui-validator` package is version `0.0.1`. It is a library; it installs
no command.

## API

```rust
use crudui_validator::{validate, validate_detail, validate_list, ValidateOptions};

let result = validate(&spec, &data, &ValidateOptions::default())?;
```

- `validate(&spec, &data, &ValidateOptions)` composes the form specification,
  checks forbidden keys and validation-rule parameters and validates `data`. It
  returns a `ValidationResult` with `valid` and `errors`; each error contains
  `path`, `field`, `rule`, `message` and `value`.
- `validate_list(&spec, &ValidateListOptions)` checks list structure and
  `validate_detail(&spec, &ValidateDetailOptions)` checks detail structure,
  including the `fields` map. Both return `Ok(())` for a clean structure.

Options accept `files`, a virtual file set for `$ref`, a `loader` and a
`basepath` for relative references. `validate` returns
`Err(ValidateError::Load)` for a composition or forbidden-key failure and
`Err(ValidateError::Input)` with code `INVALID_FORM_INPUT` for data with the wrong
shape; the structure checks return the `ComposeLoadError` as `Err`. A failure is
not a data validation result. The
[validation procedure](../../docs/operations/validation.md) shows usage in every
language.

## Checks

From the repository root:

```sh
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test list_validity_conformance
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test detail_validity_conformance
```
