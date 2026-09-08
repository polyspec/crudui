# Legacy visibility

[한국어](legacy-visibility.ko.md).

This document describes the explicit legacy validators and renderers. Current
schemas use `design.show`, which does not disable data validation; see
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

These validator conditions do not define browser presentation. Legacy renderers
have separate presentation processing, described below. Do not infer identical
renderer and validator behavior from a shared property name.

## Renderer presentation

Legacy generators also accept a map-form `display_switch`. Its preprocessing
updates sibling presentation fields, including target condition classes and
styles. It is not the validator's string-expression form.

`display_target_condition_class` and `display_target_condition_style` select
wrapper presentation. Their presence changes how the renderer processes
`display_target`; these maps are not validator rules.

The legacy React renderer's `element.all_of` checks every declared condition.
An array of expected values accepts any matching value for that condition.
It applies the matching class/style settings or the `not` settings. Validators
do not evaluate these presentation settings.

## Sources and verification

- [TypeScript legacy validator](../../packages/validator-ts/src/legacy/Validator.ts)
- [PHP legacy validator](../../packages/validator-php/src/Legacy/Validator.php)
- [Go legacy validator](../../packages/validator-go/validator/legacy/validator.go)
- [Rust legacy validator](../../packages/validator-rust/src/legacy/validator.rs)
- [React presentation preprocessing](../../packages/generator-react/src/legacy/hooks/legacyDisplay.ts)
- [React condition evaluation](../../packages/generator-react/src/legacy/hooks/useConditional.ts)
- [Shared legacy validator cases](../../tests/cases/display-switch.json)

Test results and deployment status are maintained separately in
[feature status](../features.md). Passing validator cases do not prove renderer
equivalence.
