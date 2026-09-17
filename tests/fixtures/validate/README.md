# Validation fixtures

[한국어](README.ko.md).

`cases.json` contains the shared form validation cases for TypeScript, PHP, the PHP extension, Go
and Rust. Each case provides `name`, `note`, `spec`, `data`, optional `files`, and either
`expected` or `expectFailure`. `expected` is the complete `{ valid, errors }` result, and every
error has `path`, `field`, `rule`, `message` and `value`. `expectFailure` is
`{ code, message, at }`: a composition failure's `at` is its trace joined with `.`, and an input
failure's `at` is empty.

These cases check relative, parent and field paths in rules, ternary and condition-map limits,
conditional requiredness, keyed groups and scalars, repeated-field paths, `unique`, `mincount`,
`equalto`, regular expression and `accept` values, choice membership with translated and empty
labels, member order, composed specifications, the first error per field, message overrides,
unregistered rules, empty values that skip format rules, and the shape of submitted data. The
visibility cases check that a field hidden by `design.show` (an expression, a condition map or
`false`, in its row context) skips all of its rules and those of every field it contains, while
other rules still read its kept value, and a three-step toggle that validates kept values again
once the field is shown. The `multiple: only` cases check per-row validation of data rows and
missing data that has no row but still fails `required` and `mincount`. Failure cases use `REF_FILE_NOT_FOUND` and `INVALID_FORM_INPUT`. The
[test fixture contract](../../../docs/spec/test-fixtures.md) describes the format.

## Comparisons

Each consumer runs the validator and compares the complete result or failure record. The `errors`
array is compared in order. Go, Rust and PHP compare numbers by value, so `5` and `5.0` are equal.
The [PHP extension runner](../../../packages/php-ext/tests/validate.php) compares JSON text, so
member order is compared there as well. A failure case compares `code`, `message` and `at`
exactly, and every case must declare exactly one of `expected` and `expectFailure`.

The cross-check console's validator processes receive each case on standard input. A result case
exits `0` with the result on standard output; a failure case exits `2` with `{ error, code, at }`.

Consumers are the validation conformance tests in
[TypeScript](../../../packages/validator-ts/src/validate.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/ValidateConformanceTest.php),
[Go](../../../packages/validator-go/validator/validate/conformance_test.go) and
[Rust](../../../packages/validator-rust/tests/validate_conformance.rs); the
[PHP extension engine test](../../../packages/php-ext/tests/engine.test.mjs) and the
[PHP extension API test](../../../packages/php-ext/tests/api.test.mjs), which runs the PHP and native
validators; and the cross-check console
[validator process test](../../../examples/cross-check-console/server/validator-processes.test.mjs),
which sends every case to the five validator processes, and its
[validation runner test](../../../examples/cross-check-console/server/validate-runner.test.mjs),
which compares the four language results.

## Regeneration

Run from the repository root:

```sh
node_modules/.bin/tsx tests/fixtures/validate/generate.ts > tests/fixtures/validate/cases.json
```

The generator runs the TypeScript validator and records each result or failure record, except
for two groups written from the specification: [`value-rules.ts`](value-rules.ts) states each
field's outcome, and [`visibility.ts`](visibility.ts) states the complete result record. Both use
the default rule messages in `visibility.ts`.
Specifications that the generator holds as JSON text keep their member order in `cases.json`.
Review changes against the specification and run every consumer before accepting them.
Regeneration alone is not verification.
