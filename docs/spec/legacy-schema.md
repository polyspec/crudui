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

`display_switch` and `display_target` can disable legacy validation. Renderer
presentation processing is separate; see [legacy visibility](legacy-visibility.md).
Current schemas reject those keys and separate `design` from `validate`.

## Renderer and submission declarations

Legacy renderer types extend the validator field model with content, widget and
presentation settings. The React `FormBuilder` accepts a parsed specification or
YAML text. Its language setting selects translated content. A dynamic `items`
descriptor describes an external source; the declaration alone does not fetch it.

The root's `action` can declare `method`, `url`, `enctype` and `buttons`. Button
declarations can include `label`, `class`, `type`, `href` and `onclick`. Application
submission and server persistence remain separate operations.

## Source definitions

- [Legacy validator types](../../packages/validator-ts/src/legacy/types.ts)
- [Legacy React renderer types](../../packages/generator-react/src/legacy/types.ts)
- [Legacy field registry](../../packages/generator-react/src/legacy/components/fields/index.ts)
- [Legacy validator traversal](../../packages/validator-ts/src/legacy/Validator.ts)
- [Example index](../../examples/README.md)

The shared expression grammar is documented in [expressions](expressions.md).
Legacy validator helpers have their own parameter processing; the current
expression contract does not establish equivalence of all legacy helper APIs.
