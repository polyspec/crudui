# Test fixtures

[한국어](test-fixtures.ko.md).

Fixtures define inputs and expected behavior. Their format depends on the tested
contract. A passing legacy fixture does not establish current API conformance.

The legacy comparison runner uses explicit legacy implementations. Every selected
implementation must execute successfully, match the fixture expectation and agree
with the other selected implementations. Missing output, execution failure or an
unreadable suite fails the run. Native executables are rebuilt before comparison.

| Location | Contract |
| --- | --- |
| `tests/fixtures/validate/cases.json` | Current validation results and composition failures. |
| `tests/fixtures/compose/` | Reference and patch composition. |
| `tests/fixtures/expr/` | Tokens, ASTs and expression evaluation. |
| `tests/fixtures/form-render/` | Expected form rendering. |
| `tests/fixtures/form-session/` | Shared form controls and interaction scenarios. |
| `tests/cases/*.json` | Legacy validation cases. |

## Current validation

The validation fixture is an array. Each entry has `name`, `spec` and `data`;
optional `files` supplies composition inputs. `note` describes the case.
`expected` contains the complete `{ valid, errors }` result. A load-failure case
instead uses `expectLoadError: { code }`.

```json
{
  "name": "supplied-name",
  "spec": {
    "type": "group",
    "properties": { "name": { "type": "text", "validate": { "required": true } } }
  },
  "data": { "name": "Example" },
  "expected": { "valid": true, "errors": [] }
}
```

The [TypeScript conformance test](../../packages/validator-ts/src/validate.conformance.test.ts)
compares the complete result strictly and checks the composition error code.
It also rejects entries without an expectation. PHP, Go and Rust consume the
same validation fixture in their package suites.

## Legacy validation

A legacy suite has `testSuite`, `version`, `description` and `tests`. The fixture
version describes its format, not the package version. Each test has `id`, `spec`
and `cases`. A case contains `input` and `expected`; `expected.valid` gives the
result, while optional `error` and `field` assert the first rule and field path.

The legacy bridge wraps a simple field spec in a group under `value` and wraps
its input under the same key. A group with `properties` is used directly.
The `"__undefined__"` input marker represents a missing value in the bridge.
See the [legacy TypeScript bridge](../../packages/validator-ts/src/__tests__/conformance.test.ts).

## Adding and reviewing cases

Place a case under the contract it tests. Use a descriptive identifier and include
the input that demonstrates the behavior. Derive expected results from the
specification; do not change them merely to match a failing implementation.
If the contract changes, review the expectation and implementation together.

Generated expectations require the same review as handwritten expectations.
Generation alone does not prove correctness. Run the relevant implementations
against the resulting fixture and record current results in
[feature status](../features.md). Counts and deployment results do not belong in
the fixture format contract.

Tests executed from a candidate archive create writable scratch fixtures under
the operating system temporary directory. They resolve that directory to one
canonical absolute path and use only regular path components. Candidate tests do
not require Git metadata and do not write scratch fixtures under the extracted
source directory. Each test creates a unique directory and removes it after the
test completes.

[Form verification](../operations/verification.md) defines the separate rendering,
DOM, style, control-state and browser interaction checks.
