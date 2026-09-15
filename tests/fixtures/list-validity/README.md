# List validity fixtures

[한국어](README.ko.md).

`cases.json` cases share one shape with the other structure validity families
([form](../spec-validity/README.md), [list](../list-validity/README.md) and
[detail](../detail-validity/README.md)): `{ name, note, spec, files?, expect, reason?, engine }`.

- `expect` is the meta-schema result for `#/definitions/List` in the [meta-schema](../../../schema/crudui.schema.json), `"ok"` or `"fail"`.
- `reason` is present only on a `"fail"` case and is required there. It names an Ajv keyword that
  must appear among the errors.
- `engine` is the runtime structure validation result. `"pass"` means no load failure and the result
  `{ valid: true, errors: [] }`; `{ code, at }` is the load failure code and the composition trace
  joined with `.`.
- `files` is the composition file set that every runtime consumer passes to the engine. The
  meta-schema reads `spec` alone.

The two results are independent. Every consumer applies every member it owns: no consumer classifies
cases itself or supplies its own files. [`check-schema.mjs`](../../../scripts/check-schema.mjs), run by
`npm run spec:schema`, asserts this shape for all three families before it checks `expect` and
`reason`.

A shape that only the meta-schema rejects, such as missing `columns`, an unknown `sort` key or an
invalid `pagination.mode`, has `engine: "pass"`.

The accepted cases check minimal columns, every cell format, shorthand and boolean formats, sort,
pagination, actions, the empty state and design, composed columns and a composed search form. The
rejected cases cover missing columns, forbidden and `x`-prefixed column keys, unknown keys on a
column, sort, pagination, an action and the list root, a forbidden key in format options, invalid
enum values and a malformed format value.

## Comparisons

The [list meta-schema test](../../../packages/validator-ts/src/list-metaschema.conformance.test.ts)
and `check-schema.mjs` compile the list entry point and check `expect` and `reason`.

The runtime tests validate `spec` with `files`, read no rows and compare `engine`. The Rust structure
API returns `Ok(())` for `"pass"`, its equivalent of `{ valid: true, errors: [] }`. The PHP
command-line test expects exit `0` with the clean result or exit `2` with `{ error, code, at }`, and
the cross-check console sends every case to the four command-line validators and requires the same
result from each.

Runtime consumers are the list validation tests in
[TypeScript](../../../packages/validator-ts/src/validate-list/validate-list.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/ListValidateConformanceTest.php), the
[PHP command line](../../../packages/validator-php/tests/Validate/ListValidateCliTest.php),
[Go](../../../packages/validator-go/validator/validate/list_conformance_test.go),
[Rust](../../../packages/validator-rust/tests/list_validity_conformance.rs), the
[PHP extension engine test](../../../packages/php-ext/tests/engine.test.mjs), the
[PHP extension runner](../../../packages/php-ext/tests/validate.php) and the cross-check console
[list runner test](../../../examples/cross-check-console/server/validate-list-runner.test.mjs).

## Regeneration

There is no generator; the cases are written by hand. Keep `expect` and `reason` consistent with
the list definitions in the meta-schema, and `engine` consistent with composition and the
forbidden-key scan of every runtime. A composed case must carry every referenced file in `files`.
Run the meta-schema check and every runtime consumer after changing a case.
