# Shared expression fixtures

[한국어](README.ko.md).

TypeScript, PHP, Go, Rust and the PHP extension load `cases.json`. Each case
contains an expression, expected tokens and AST, and data contexts with expected
boolean and value results. A rejected case contains only `name`, `expr` and
`error`, the first line of the parse error message; the PHP extension, which
reports no message, checks that the expression does not parse. The [expression contract](../../../docs/spec/expressions.md) defines
semantics. Source positions are excluded from token and AST comparison.

Tokens contain `type`, `value` and `literal`. Whitespace is omitted and the final
token is `EOF`. AST fields are:

| Node | Fields |
| --- | --- |
| Ternary | `type`, `condition`, `trueValue`, `falseValue` |
| Binary | `type`, `operator`, `left`, `right` |
| Unary | `type`, `operator`, `operand` |
| In | `type`, `negated`, `value`, `list` |
| Path | `type`, `relative`, `levelsUp`, `segments` |
| Literal | `type`, `valueType`, `value` |
| Group | `type`, `expression` |

A path segment has type `identifier` with a string value, `wildcard` without a
value, or `index` with a numeric value. Data contexts contain `data`, optional
`currentPath`, expected `value` and expected `truthy`.

The cases cover relative and wildcard paths, comparisons, membership, logical
precedence, nested ternaries, path comparisons, boolean conversion, an unclosed
list, and the nesting limit: groups, negations, a chain and ternaries exactly at
64 levels, each one level over it, and an expression 10,000 groups deep. Empty
arrays and objects are true in a condition; required-input validation is separate.
Condition-map keys are tested as expressions; these cases do not prove map-order
resolution by themselves.

Regenerate from the repository root:

```sh
node_modules/.bin/tsx tests/fixtures/expr/generate.ts > tests/fixtures/expr/cases.json
```

The generator records actual TypeScript tokens, ASTs and results. Review generated
changes against the contract and run every language suite and the PHP extension
engine test. Do not update
expected results solely to make a failed implementation pass.
