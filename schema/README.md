# Form-Spec JSON Schema

`form-spec.schema.json` is the machine-readable JSON Schema (draft-07) for a
form-spec definition. It is generated from the TypeScript source of truth
`packages/validator-ts/src/types.ts` (the `Spec` interface) by
`ts-json-schema-generator`.

Do not hand-edit `form-spec.schema.json`. Regenerate it:

```bash
make docs-schema       # or: npm run spec:schema
```

The generator is idempotent: repeated runs produce a byte-identical file. The
script also self-validates the schema with Ajv and smoke-tests it against the
example specs in `examples/shared-specs/`.

## Editor integration

Point your YAML editor at the schema so spec files get completion and validation.

In a YAML spec file (VS Code with the YAML extension), add a modeline:

```yaml
# yaml-language-server: $schema=../../schema/form-spec.schema.json
type: group
properties:
  email:
    type: email
    rules:
      required: true
      email: true
```

Or map it globally in `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./schema/form-spec.schema.json": ["examples/**/*.yml", "**/*.form.yml"]
  }
}
```

For JSON specs, reference it inline:

```json
{ "$schema": "./schema/form-spec.schema.json", "type": "group", "properties": {} }
```

## Limitations

The schema is derived mechanically from `types.ts` and inherits its shape:

- `FieldSpec` carries an index signature (`[key: string]: unknown`), so unknown
  field keys are permitted by design. The schema therefore does not reject
  generator-only or renderer-only keys (display/element extras).
- TSDoc descriptions on interface fields flow into the schema as `description`.
- The `Spec` type uses optional-heavy interfaces; the schema requires only what
  the TypeScript type marks required (`type`, `properties`).
- `Record<...>` types appear as `$ref`'d definitions with URL-encoded names; this
  is a generator artifact and does not affect validation.

These limitations come from the source types, which are not modified to fit the
schema. If a stricter schema is needed, extend the TypeScript types upstream and
regenerate.
