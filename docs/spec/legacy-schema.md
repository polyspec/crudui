# Legacy schema

[한국어](legacy-schema.ko.md).

Explicit `legacy` modules consume this field model. The package root uses the
[current schema](schema.md). Selecting a legacy module is explicit; the current
validator does not convert legacy declarations.

## Fields and rules

A legacy root uses `type: group` and a `properties` map. Each map key is a field
name. Nested groups use another `properties` map. Fields declare rules under
`rules` and custom rule messages under `messages`.

```yaml
type: group
properties:
  email:
    type: email
    label: Email
    rules:
      required: true
      email: true
    messages:
      required: Enter an email address.
```

Rules are a map of rule names to parameters. Messages are a map of rule names to
strings. Rendering properties such as labels, placeholders, classes and choice
labels do not themselves declare validation rules.

`multiple: true` supports repeated group values and repeated scalar values.
The TypeScript legacy validator traverses array groups by index and object groups
by sorted key. It retains the index or key in error paths. This is distinct from
the current [form instance order contract](form-runtime.md).

`display_switch` and `display_target` can disable legacy validation; see
[legacy visibility](legacy-visibility.md). Current schemas reject those keys and
separate `design` from `validate`.

## Legacy validator

TypeScript, PHP, Go and Rust each ship an explicit legacy validator that reads this field model and
returns the valid flag with the rule and path of the first error. The PHP extension has no legacy
validator. The shared cases in
[`tests/fixtures/legacy-validate/cases.json`](../../tests/fixtures/legacy-validate/README.md) prove
the `validateLegacy` feature of the [feature contract](feature-contracts.md): each runtime's legacy
conformance test runs them, and root `npm test` compares the four results.

## Submission declarations

The root's `action` can declare `method`, `url`, `enctype` and `buttons`. Button
declarations can include `label`, `class`, `type`, `href` and `onclick`. No renderer
reads legacy declarations: the legacy translator converts them to the current root
`action` and `buttons` (see [schema](schema.md)). Application submission and server
persistence remain separate operations.

## Source definitions

- [Legacy validator types](../../packages/validator-ts/src/legacy/types.ts)
- [Legacy validator traversal](../../packages/validator-ts/src/legacy/Validator.ts)
- [Example index](../../examples/README.md)

The shared expression grammar is documented in [expressions](expressions.md).
Legacy validator helpers have their own parameter processing; the current
expression contract does not establish equivalence of all legacy helper APIs.
