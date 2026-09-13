# Expression grammar

[한국어](expressions.ko.md).

This contract defines condition expressions and value-returning ternaries in
TypeScript, PHP, Go and Rust. Expressions used by design settings and conditional
validation use the same token, AST and evaluation contract. Behavior scripts are
application JavaScript and are not evaluated by this engine.

## 0. Processing

The lexer converts source text to tokens. The parser converts tokens to an AST.
The evaluator receives the AST, form data and the current field path. PHP, Go and
Rust provide these stages as well as TypeScript. Evaluation does not use `eval`.

## 1. Tokens

| Token | Pattern | Example |
| --- | --- | --- |
| `DOT` | `.` | `.field` |
| `DOT_DOT` | two or more dots | `..field` |
| `ASTERISK` | `*` | `items.*.name` |
| `IDENTIFIER` | `[A-Za-z_][A-Za-z0-9_]*` | `status` |
| `STRING` | single or double quoted text | `'active'` |
| `NUMBER` | integer or decimal | `42` |
| `BOOLEAN` | `true` or `false` | `true` |
| `NULL` | `null` | `null` |
| `EQ NE` | `==` `!=` | `.status == active` |
| `GT GE LT LE` | `>` `>=` `<` `<=` | `.count > 0` |
| `AND OR NOT` | `&&` `\|\|` `!` | `!.enabled` |
| `IN NOT_IN` | `in` `not in` | `.country in [US, CA]` |
| `QUESTION COLON` | `?` `:` | `.enabled ? 'yes' : 'no'` |
| `LPAREN RPAREN` | `(` `)` | `(.a || .b)` |
| `LBRACKET RBRACKET COMMA` | `[` `]` `,` | `[US, CA]` |
| `WHITESPACE` | whitespace, omitted from output | space |
| `EOF` | end of input | end of input |

## 2. Grammar

The parser accepts one comparison per comparison expression. Parentheses group
logical expressions. Ternary branches may contain further ternaries.

```ebnf
expression = ternary ;
ternary = logic_or [ "?" ternary ":" ternary ] ;
logic_or = logic_and { "||" logic_and } ;
logic_and = negation { "&&" negation } ;
negation = "!" negation | comparison ;
comparison = primary [ ( "==" | "!=" | ">" | ">=" | "<" | "<=" ) compare_value
                       | ( "in" | "not in" ) value_list ] ;
primary = path | literal | "(" logic_or ")" ;
path = [ dots ] IDENTIFIER { "." ( IDENTIFIER | NUMBER | "*" ) } ;
dots = "." { "." } ;
compare_value = primary | IDENTIFIER ;
value_list = "[" value { "," value } "]" | value { "," value } ;
value = literal | IDENTIFIER ;
literal = STRING | NUMBER | BOOLEAN | NULL ;
```

On the right side of a comparison, a bare identifier is a string. An identifier
followed by a dot is a path; a leading dot also identifies a path. Thus
`.status == active` compares with a string and `.a < .b` compares field values.

Ternary branch strings must be quoted. An unquoted branch identifier is a data
path, so `.vip ? gold : plain` reads fields named `gold` and `plain`.

## 3. Precedence

From lowest to highest:

1. `?:`, right associative
2. `||`
3. `&&`
4. `!`, applied to the following comparison or negation
5. `== != > >= < <= in not in`, one comparison
6. Paths, literals and parenthesized logical expressions

For example, `!.a == .b` means `!(.a == .b)`.

## 4. AST

The node types are `Ternary`, `Binary`, `Unary`, `In`, `Path`, `Literal` and
`Group`. Paths contain identifier, wildcard or numeric-index segments. Shared
fixtures compare semantic fields, excluding source positions. Tokens include
`type`, `value` and `literal`; token streams omit whitespace and end with `EOF`.
The [shared fixture format](../../tests/fixtures/expr/README.md) defines the
serialized fields used in cross-language checks.

## 5. Evaluation

Condition evaluation returns a boolean. Value evaluation returns the selected
branch value for a ternary, including nested ternaries; other expressions return
their boolean condition result. A condition map returns its selected value as
stored. A literal path outside a ternary does not return raw form data.

Logical operators short circuit. Membership uses the same equality operation as
`==`; `not in` negates membership. Equality compares matching scalar types
directly; different scalar types use numeric conversion when both convert,
otherwise string comparison. Relational comparisons convert both sides to
numbers. A string uses its leading numeric part, or zero when no number is
available. This condition conversion is separate from numeric validation rules.

A relative `.field` resolves beside the current field. `..field` moves one parent
level further; each additional dot moves one additional level. An unprefixed
path resolves from the data root. Missing values are false in a condition.
Default field values are prepared by form binding; the expression evaluator does
not load a specification to find defaults.

This conversion answers a condition; it does not determine whether required
input exists. The `required` rule rejects empty arrays and objects. Numeric zero
and boolean false are valid supplied values for that rule. Collection count and
visibility are separate contracts; see [empty collections](empty-collections.md).

## 6. Boolean conversion

`null`, a missing value, `false`, numeric zero and the empty string are false.
Nonempty strings, including `"0"` and `"false"`, are true. Arrays and objects,
including empty arrays and empty objects, are true.

## 7. Wildcards

A path such as `items.*.name` resolves repeated entries. The default evaluation
uses current row indexes when the field context supplies them. Otherwise the
remaining wildcard resolves candidate values, and a comparison succeeds when
any candidate matches. TypeScript also exposes explicit `ANY` and `ALL`
strategies to its path evaluator; those options are not part of the shared
expression facade.

## 8. Condition maps

Condition maps evaluate non-default keys in declaration order and return the
first matching value. The literal key `true` supplies the default only after all
other conditions fail, regardless of its position. With no match and no default,
the result is null.

```yaml
class:
  ".status == 'active'": status-active
  ".status == 'pending'": status-pending
  true: status-default
```

Map values are returned without expression evaluation. Each non-default key uses
the same parser and evaluator as a standalone condition.

## 9. Verification

All four languages load the same expression fixtures and compare token streams,
serialized ASTs, boolean results and value results. The fixture generator records
TypeScript output; conformance tests rerun every implementation against those
expectations. Generation alone does not establish correctness. Expected semantics
must agree with this contract. Implementation and test results belong in
[feature status](../features.md).

## 10. Unsupported operations

Arithmetic · function calls · method calls · regular-expression evaluation · assignment · bitwise operations · slash-prefixed root paths · eval.

A validation rule can accept a regular-expression parameter independently of the
expression engine. Behavior scripts remain separate from condition evaluation.
