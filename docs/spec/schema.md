# Specification structure

[한국어](schema.ko.md). This document defines field and list declarations.
Form instances, repeated row keys and caching are defined in
[form runtime](form-runtime.md). Implementation and deployment status are
recorded in [features](../features.md).

## Package API

CRUDUI starts at package version `0.0.1`. Current APIs use names without
implementation-generation suffixes. Package roots expose the current validator
and form renderer. Older implementations use explicit `legacy` modules. Shared
rules and expression utilities are independent of legacy modules. Replaced
versioned paths have no compatibility aliases.

The machine-readable contract is maintained in
[`schema/crudui.schema.json`](../../schema/crudui.schema.json). It validates
form and list declaration shapes. `make docs-schema` checks this source against
shared fixtures without generating or replacing its rules.

## Fields

A form root is a `group` with a `properties` field map. Property names define
data paths. A field separates structure, content and behavior as follows:

| Category | Keys | Contract |
| --- | --- | --- |
| Structure | `type`, `name`, `default`, `properties`, `items`, `multiple`, `lang` | Define values, nested groups, choices and repetition. |
| Content | `label`, `description`, `placeholder`, `prepend`, `append`, `help` | Accept text or a language map. |
| Validation | `validate` | Define rules and messages. |
| Appearance | `design` | Define visibility and styles for specific DOM nodes. |
| Behavior | `behavior` | Preserve event scripts without expression evaluation. |
| Type options | `options` | Store settings that apply to one widget type. |
| Composition | `$ref`, `$patch` | Load, merge and modify field definitions before binding data. |

Dependent settings remain under their subject: repeated row settings under
`multiple`, language input settings under `lang`, widget settings under `options`
and dynamic choice descriptors under `items`. Role and structural settings can
use `false`, `true` or an object where the type definition permits them. `false`
disables a setting; `true` selects defaults. The
[TypeScript types](../../packages/validator-ts/src/schema.ts) define accepted
declaration shapes. Parsers preserve declared keys; validators reject forbidden
schema keys instead of silently discarding them.

```yaml
type: group
properties:
  email:
    type: email
    label: { en: Email, ko: 이메일 }
    validate: { required: true, email: true }
    design:
      show: ".enabled"
      class: { ".priority == 'high'": text-danger, true: "" }
```

## Conditions and appearance

Conditions are values in the relevant setting. `design.show` controls visibility;
`design.class` and `design.style` apply to the main node. `design.label`,
`design.wrapper`, `design.group` and `design.prepend` target those nodes.
Condition maps select the first matching expression and require `true` as the
default key. Dedicated conditional metadata such as `show_if`, `display_switch`
and `display_target` is rejected in CRUDUI schemas.

The [expression grammar](expressions.md) defines the tokenizer, parser
and evaluator. Supported expressions include relative paths, wildcards, lists,
comparison, logic, membership and conditional values. Arithmetic, function calls
and JavaScript evaluation are unsupported. Event scripts in `behavior` are opaque
strings; evaluating them is outside the expression engine.

## Languages and choices

Content translation and language input values are separate. Content uses maps
such as `{ en: Name, ko: 이름 }`. `lang` creates one value input per configured
language, with `only`, `frame`, `title` and `group_class` settings. The default
languages are `ko`, `en`, `ja` and `zh`.

`items` can be a static array, a value-to-label map or a dynamic source descriptor
with `model`. Static labels can use language maps. Generators preserve dynamic
source settings; fetching records and executing external widgets are application
responsibilities.

## Composition and validation

Composition resolves `$ref`, then applies `$patch`, then processes the resulting
field definitions. Missing references are load errors. Composition does not
depend on record values. Form compilation resolves composition once per template.

The CLI static check also rejects unresolved composition. It does not treat
checking an uncomposed field as successful reference resolution.

Validators inspect `validate` rules and current data. The
[validation rules](validation-rules.md) describe rule semantics. Shared cases in
`tests/fixtures/expr`, `tests/fixtures/compose` and `tests/fixtures/validate`
compare the TypeScript, PHP, Go and Rust implementations. SSR comparisons and
mounted DOM tests verify different behavior and are recorded separately.

## Lists

A list declares `columns`; row records are a separate `buildList(spec, rows,
options)` argument. Each column defines a `field` path, `label`, `format`,
`design` and optional `sortable`. Lists share composition, conditions, appearance
and content translation with forms. They use display cells instead of inputs.

| Format | Settings |
| --- | --- |
| `text` | `truncate` |
| `date` | `pattern` |
| `number` | `decimals`, `thousands`, `prefix`, `suffix` |
| `badge` | Value-to-variant `map` and translated labels |
| `link` | `href`, `target`, `text` |
| `choice-label` | `items` |
| `bool` | `true` and `false` labels, `as` |
| `image` | `width`, `height`, `alt` |
| `html` | Unescaped display HTML |

`format` accepts a type string or an object; absent, `false` and `true` select
text. Format-specific settings stay in that object. `sort`, `pagination`,
`search` and `actions` declare application behavior. `empty` defines translated
empty-state content. The core does not query a database, filter records or apply
server pagination. Page metadata is supplied by the caller.

## Acceptance criteria

1. Resolve composition before evaluating fields and report missing references.
2. Keep structure, content, validation, appearance and widget options separate.
3. Evaluate conditions with the expression parser, without JavaScript evaluation.
4. Preserve language input values independently of the display language.
5. Compare shared validation cases in four languages and SSR output in three
   frameworks; verify editable form behavior with mounted views.

Repeated fields accept `multiple.min` and `multiple.max` as numeric row-count
limits. Instance collection keys identify rows; the schema does not define hidden
identity fields. See [form runtime](form-runtime.md) for row operations.

## Widget and source settings

`options` preserves settings for the corresponding widget. Declaration acceptance
does not mean that the core executes an external widget. Search uses
`keyword_min_length`; map descriptors use `marker_draggable`, `zoom` and
`geometry_type`; tags use `max_tags`. Label settings include `checkbox_label` and
`on_label`. Container settings include `collapse`, `expend`, `view_total`,
`stepper` and `blank_message`. `callback` and `event` preserve widget scripts.

Dynamic choice descriptors can specify `model`, `method`, `table`, `relations`,
`keys` and `api_server`. A nested `items` collection supplies initial static
choices. The application performs queries and endpoint calls.

Language configuration accepts a `mode`, an `only` language list or override map,
and group `name`, `key`, `frame`, `title` and `group_class` settings. Language
overrides can change `validate`, `design`, `behavior` and `options`.
