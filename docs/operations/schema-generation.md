# Schema generation

[한국어](schema-generation.ko.md).

Run `make docs-schema` from the repository root after installing npm dependencies.
The command reads `packages/validator-ts/src/types.ts`, generates
`schema/crudui.schema.json`, compiles it with Ajv and checks example specs.
`make docs-site` builds the documentation site after API documents are generated.

The schema generator uses its bundled TypeScript compiler. The validator compiler
configuration must contain options accepted by that compiler as well as the
package compiler. Run `npm run typecheck -w @crudui/validator` and
`make docs-schema` when changing shared compiler options. Do not disable type
checking to bypass configuration errors.
