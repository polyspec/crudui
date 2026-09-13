# Legacy visibility

[한국어](legacy-visibility.ko.md).

This document describes the explicit legacy validators. Current schemas use
`design.show`, which does not disable data validation; see
[schema structure](schema.md) and [data validation](../operations/validation.md).

## Validator conditions

Legacy fields declare `display_switch` and `display_target` on the affected
field. When either condition disables validation, the validator skips that
field's rules. Skipping a group also skips its descendants.

| `display_switch` | Validator behavior |
| --- | --- |
| Absent, `true` or an empty string | Continue validation. |
| `false` | Skip validation. |
| Condition string | Continue only when the expression is true. |

```yaml
type: group
properties:
  payment_type:
    type: select
    items: { card: Card, bank: Bank }
  card_number:
    type: text
    display_switch: ".payment_type == 'card'"
    rules: { required: true }
```

Here an empty `card_number` fails only when `payment_type` is `card`.
`display_target` instead references another value. Missing values, null, false,
empty strings, empty arrays and empty objects skip validation. Numeric zero and
the string `"0"` count as present.

These validator conditions do not define browser presentation. No renderer reads
legacy declarations: current forms render the [current schema](schema.md), where
`design.show` controls presentation.

## Sources and verification

- [TypeScript legacy validator](../../packages/validator-ts/src/legacy/Validator.ts)
- [PHP legacy validator](../../packages/validator-php/src/Legacy/Validator.php)
- [Go legacy validator](../../packages/validator-go/validator/legacy/validator.go)
- [Rust legacy validator](../../packages/validator-rust/src/legacy/validator.rs)
- [Shared legacy validator cases](../../tests/cases/display-switch.json)

Test results and deployment status are maintained separately in
[feature status](../features.md).
