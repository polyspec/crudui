# Schema validation

[한국어](schema-validation.ko.md).

Run `make docs-schema` from the repository root after installing npm dependencies.
The command compiles `schema/crudui.schema.json` with Ajv and checks shared form
and list fixtures. It fails when the schema is invalid or a fixture result differs.
It does not modify the schema or expected results.

`scripts/check-schema.mjs` holds every specification in the repository that is meant
to be valid to the meta-schema: the form, list and detail specification of every
fixture family, each composition file as the fragment its `$ref` selects, the
specifications of every example under `examples` and `packages/*/examples`, and the
form-session and validator command-line specifications. A case that expects an input
or composition failure is not such a specification and is skipped. A specification
declared outside the schema on purpose is listed in the script with its reason and
asserted to fail, so an exemption cannot become silent. The legacy corpora in
`examples/legacy` and `tests/fixtures/specs` declare the
[legacy field model](../spec/legacy-schema.md), which the current schema rejects by
design; they are checked as legacy instead: each file must parse under the unique-key
rule and must not pass the current meta-schema.

The JSON Schema defines accepted declaration shapes. The TypeScript declarations
in `packages/validator-ts/src/schema.ts` provide corresponding authoring types.
Update both when changing the declaration contract, then run the validator suites,
CLI checks and `make docs-schema`. `make docs-clean` preserves the schema source.
