# Schema validation

[한국어](schema-validation.ko.md).

Run `make docs-schema` from the repository root after installing npm dependencies.
The command compiles `schema/crudui.schema.json` with Ajv and checks shared form
and list fixtures. It fails when the schema is invalid or a fixture result differs.
It does not modify the schema or expected results.

The JSON Schema defines accepted declaration shapes. The TypeScript declarations
in `packages/validator-ts/src/schema.ts` provide corresponding authoring types.
Update both when changing the declaration contract, then run the validator suites,
CLI checks and `make docs-schema`. `make docs-clean` preserves the schema source.
