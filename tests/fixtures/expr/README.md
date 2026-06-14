# Expression engine shared fixtures (4-language gate)

`cases.json` is the single shared fixture. All four engines (JS / PHP / Go /
Rust) load this one file and must pass it. Do not fork per language. Do not edit
`cases.json` by hand — regenerate it (see "Generation").

Root is an array of cases. Each case:

```jsonc
{
  "name":  "unique-id",                 // string, unique
  "expr":  ".status == 'active'",       // source expression
  "tokens": [                           // expected token stream
    { "type": "DOT", "value": ".", "literal": null },
    // ... WHITESPACE excluded; EOF is the last token
  ],
  "ast":   { /* expected AST, serialized */ },
  "cases": [                            // per-data evaluation
    {
      "data": { "status": "active" },   // arbitrary form-data object
      "currentPath": ["self"],          // optional; relative/wildcard context, default []
      "value":  "text-success",         // expected evaluateValue() result (boolean|string|number|null)
      "truthy": true                    // expected evaluate() boolean result
    }
  ]
}
```

## Three-stage contract (EXPRESSION-GRAMMAR §9)

1. `lexer(expr)` == `tokens`
2. `parser(tokens)` == `ast`
3. for each `cases[]`: `evaluate(ast, ctx)` == `truthy` AND `evaluateValue(ast, ctx)` == `value`
   where `ctx = { currentPath, formData: data }`.

## Serialization rules

- `position` is excluded from every token and every AST node. The Rust AST holds
  no position; including it would break 4-language parity.
- Token: `{ type, value, literal }`. `type` is the `TokenType` string
  (`DOT` `DOT_DOT` `IDENTIFIER` `ASTERISK` `EQ` `NE` `GT` `GE` `LT` `LE` `AND`
  `OR` `NOT` `IN` `NOT_IN` `LPAREN` `RPAREN` `LBRACKET` `RBRACKET` `COMMA`
  `QUESTION` `COLON` `STRING` `NUMBER` `BOOLEAN` `NULL` `EOF`). `WHITESPACE` is
  dropped; the stream always ends with `EOF`.
- AST node field names are the JS-actual ones:
  - `Ternary { type, condition, trueValue, falseValue }`
  - `Binary  { type, operator, left, right }`
  - `Unary   { type, operator, operand }`
  - `In      { type, negated, value, list }`
  - `Path    { type, relative, levelsUp, segments[] }`
    - segment = `{ type:'identifier', value }` | `{ type:'wildcard' }` | `{ type:'index', value:<number> }`
  - `Literal { type, valueType, value }`  (`valueType` ∈ `string|number|boolean|null`)
  - `Group   { type, expression }`

## Coverage

38 cases, 77 data-evaluations.

- Simple paths: `.x` (sibling), `..x` (parent up), `items.*.y` (wildcard),
  `items.*.is_close == 0` (wildcard compare).
- Comparisons: `==` (quoted + unquoted-identifier RHS), `!=`, `>`, `>=`, `<`
  (string coercion), `in` (number list, bracket identifier list), `not in`.
- Logical: `&&`, `||`, `!`, `!(...)`.
- Precedence stress: `||` vs `&&`, parentheses override, `!` vs `&&`.
- Nested ternary (right-associative): `.level==1 ? 'a' : .level==2 ? 'b' : 'c'`.
- Value-returning ternary: string / number / null branches.
- Path-vs-path comparison: `.a < .b`, `.password == .password_confirm`, `.max >= .min`.
- Condition-map shaped: `condmap-key-*` keys + default key `true` (always-true).
  A condition map is a thin wrapper that calls the engine once per key in
  declaration order; each key is modeled as a standalone case here.
- Truthy boundaries: `null`, missing, `0`, `""`, `[]`, `{}`, non-empty string,
  literal `true` / `false`.

Note on `value` for non-ternary expressions: `evaluateValue` returns the boolean
condition result (not a raw resolved path value) for everything except ternary,
matching the JS `evaluateExpressionValue` reference. Only ternary returns its
branch value.

## Generation

Expected values are produced by running the JS reference engine for real
(`packages/validator-js/src/parser/{ConditionParser,PathResolver}.ts`) — not
hand-written. Regenerate:

```sh
# from repo root
node_modules/.bin/tsx tests/fixtures/expr/generate.ts > tests/fixtures/expr/cases.json
```

`generate.ts` imports `Lexer` / `Parser` / `evaluateCondition` /
`evaluateExpressionValue` directly from the validator-js source, runs every case,
strips `position`, and dumps the JSON.

## Spec-vs-engine mismatches (recorded — spec wins)

The dumped `value`/`truthy` are the JS engine's actual output. Two cases diverge
from EXPRESSION-GRAMMAR §6 (truthy rule: `null` · `false` · `0` · `""` · empty
array · empty object = falsy). The spec is authoritative; the engine must be
fixed to converge. Until then these fixture entries hold the JS-actual value and
are flagged here:

- `truthy-empty-array` (`.v` with `v: []`): JS dumps `truthy:true`, `value:true`.
  Spec §6 says empty array is **falsy** → expected `false`. Cause: JS
  `Boolean([])` is `true`; `evaluateCondition` does not apply the spec empty-value
  rule to standalone paths.
- `truthy-empty-object` (`.v` with `v: {}`): JS dumps `truthy:true`, `value:true`.
  Spec §6 says empty object is **falsy** → expected `false`. Same cause
  (`Boolean({})` is `true`).

When the engines are aligned to §6, flip both to `false` and remove this note.
