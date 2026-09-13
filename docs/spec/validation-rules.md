# Validation rules

[한국어](validation-rules.ko.md).

Current fields declare rules under `validate`. The [schema contract](schema.md)
defines field structure; [validation APIs](../operations/validation.md) define
entry points, load failures and input failures. Explicit legacy modules use
`rules` instead.

## Registered rules

| Rules | Parameter and operation |
| --- | --- |
| `required` | `true` requires a supplied, nonempty value. |
| `email`, `url` | Boolean enablement of the corresponding format check. |
| `minlength`, `maxlength` | Numeric minimum or maximum string length. |
| `rangelength` | `[minimum, maximum]` string length. |
| `number`, `digits` | Boolean enablement of numeric or digit-only input checks. |
| `min`, `max` | Numeric lower or upper bound. |
| `range` | `[minimum, maximum]` numeric bounds. |
| `step` | Numeric increment. |
| `match`, `pattern` | Regular-expression parameter; both names use the same rule implementation. |
| `equalTo`, `notEqual` | Field comparison; the rule receives its reference or literal parameter unchanged. |
| `in` | Membership values, including array or map forms. |
| `date`, `dateISO` | Boolean enablement of date format checks. |
| `enddate` | Start-date field path; a parsed end date must not precede the parsed start date. |
| `mincount`, `maxcount` | Minimum or maximum collection size. |
| `unique` | Uniqueness check, optionally using a reference or filter parameter. |
| `accept` | File extension or MIME-type parameter. |

The [TypeScript registry](../../packages/validator-ts/src/rules/index.ts) defines
built-in names. `crudui describe` derives its catalog from this registry;
see the [CLI procedure](../operations/cli.md). Registering a custom TypeScript
rule does not install that rule in other languages.

## Evaluation

Rules run in declaration order and stop at the first failure for each field.
A resolved `false` or `null` parameter disables the rule. The runtime skips
unregistered rules; validate declaration shapes separately rather than treating
runtime acceptance as schema verification.

Missing values, null, whitespace-only strings, empty arrays and empty objects
are empty for `required`. Numeric zero and boolean false are supplied values.
Other format and bound rules generally allow empty values; collection-count
rules evaluate empty collections. Requiredness and collection limits are
separate; see [empty collections](empty-collections.md).

A `number` field runs the implicit `number` check before other rules unless it
declares that rule explicitly. Nonfinite numeric inputs fail numeric validation.
String length uses Unicode code points. A pattern is not implicitly anchored;
declare anchors when the complete string must match.

Repeated scalar fields apply `required`, `unique`, `mincount` and `maxcount` to
the collection and other rules to each element. Nested repeated groups retain
their row keys in error paths. The [form runtime](form-runtime.md) defines row
identity and order.

## Conditional parameters

```yaml
type: group
properties:
  email:
    type: email
    validate:
      required: ".enabled"
      email: true
  amount:
    type: text
    validate:
      min: ".premium ? 10 : 1"
```

Conditional parameters use the [expression contract](expressions.md). A condition
map selects the first matching value, or its `true` default. Ternary expressions
return the selected branch value.

`equalTo`, `notEqual`, `unique`, `enddate`, `accept`, `match`, `pattern` and `in`
receive parameters unchanged for their own processing. In particular,
`enddate: period.start` references a field; it is not a boolean condition.
For `enddate`, `.start` resolves a sibling field and `..start` resolves one
group level above, using the common field-reference resolver.
Membership maps are value sets, not condition maps.

`design.show` does not disable validation. Conditional requiredness must be
declared in `validate.required`. Browser visibility and server validation remain
separate operations.

## Errors and verification

Each error contains the field path, field name, failing rule, message and value
when available. Custom messages use the declared rule name, including the
distinction between `match` and `pattern`. Defaults are defined by the rule
implementations. The [fixture contract](test-fixtures.md) defines expected
results and failure records.

Run all four validator package suites using the [testing procedure](../operations/testing.md).
Record actual results in [feature status](../features.md); a rule name appearing
in every registry does not prove all inputs behave identically.
