# Specification structure

[한국어](schema.ko.md). This document defines field and list declarations.
Form instances, repeated row keys and caching are defined in
[form runtime](form-runtime.md). Implementation and deployment status are
recorded in [features](../features.md).

## Package API

CRUDUI starts at package version `0.0.1`. File names, public APIs and internal
identifiers describe their roles without implementation-generation markers.
Package roots expose the current validator and form renderers, including the
framework-independent `@crudui/generator-html` renderer. Replaced versioned
paths have no compatibility aliases.

The machine-readable contract is maintained in
[`schema/crudui.schema.json`](../../schema/crudui.schema.json). It validates
form, list and detail declaration shapes. `make docs-schema` checks this source against
shared fixtures without generating or replacing its rules.

## Member order

A specification is JSON data. JavaScript receives it as plain objects, which list member names
that are array indexes (the decimal integers from 0 to 4294967294 written without leading zeros)
first in ascending numeric order and all other names in the order they were written. Every
runtime uses this order for every object in a specification: fields in `properties`, list columns,
detail fields, `items` value-to-label maps, the keys of every bucket, condition maps, composition files and
the objects composition produces, and compiled templates. "Declaration order" in these documents
means this order. For example, `properties` written as `b`, `10`, `a` compile, render and validate
in the order `10`, `b`, `a` in every runtime.

Arrays keep their written order; a [choice list](#choice-lists) declares choices whose values
are integer-like in their written order.

Record data keeps the order in which it arrives: form data, list rows, detail records and
`options.data` are never reordered, and [ordered JSON](../operations/ordered-json.md) preserves
numeric member names there.

## Fields

A form root is a `group` with a `properties` field map. Property names define
data paths. A field separates structure, content and behavior as follows:

| Category | Keys | Contract |
| --- | --- | --- |
| Structure | `type`, `name`, `default`, `properties`, `items`, `multiple`, `lang` | Define values, nested groups, choices and repetition. |
| Content | `label`, `description`, `placeholder`, `prepend`, `append`, `help`, `content` | Accept text or a language map. `content` is the control text of a button or action field. |
| Validation | `validate`, `messages` | `validate` defines rules; `messages` overrides a rule's error message by rule name. |
| Appearance | `design` | Define visibility and styles for specific DOM nodes. |
| Behavior | `behavior` | Preserve event scripts without expression evaluation. |
| Type options | `options` | Store settings that apply to one widget type. |
| Composition | `$ref`, `$patch` | Load, merge and modify field definitions before binding data. |

Content is resolved to text for the display language in the same way in every runtime, for form
fields and for list and detail display settings alike. A string is itself. A language map yields
the first non-empty string among its entry for the display language, `en`, `ko` and its first key;
entries that are not strings are skipped. Any other value (a number, a boolean, an array, or a map
without such an entry) is empty text.

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

### Range fields

A `range` field holds one number chosen on a slider. Its bounds and its increment are its
validation rules: `validate.range` is `[minimum, maximum]` and `validate.step` is the increment.
Both are required and both are literal values, not expressions or condition maps. The slider
moves from the minimum in steps, so the minimum is a multiple of the step and every position of
the slider passes both rules. Every validator checks the submitted value with these rules
([numbers](validation-rules.md#values)): a value passes when it is numeric, within the bounds and
a multiple of the step, and an empty value passes unless `required` is declared. `append` is the
unit written after the current value. The [form markup](form-markup.md#range-fields) defines the
control.

```yaml
volume:
  type: range
  label: Volume
  default: 50
  append: "%"
  validate: { range: [0, 100], step: 5 }
```

Compilation checks a range field after its `behavior` and fails with `INVALID_FORM_INPUT` and an
empty location. Multiples are decided exactly, as the `step` rule decides them.

| Declaration | Message |
| --- | --- |
| `validate.range` absent, or not two finite numbers with the minimum not above the maximum | `Invalid validate.range at {path}: expected [minimum, maximum] finite numbers with minimum not above maximum` |
| `validate.step` absent, or not a finite number above 0 | `Invalid validate.step at {path}: expected a finite number above 0` |
| A minimum that is not a multiple of the step | `Invalid validate.range at {path}: expected a minimum that is a multiple of validate.step` |

## Conditions and appearance

Conditions are values in the relevant setting. `design.show` controls visibility;
`design.class` and `design.style` apply to the main node. `design.label`,
`design.wrapper`, `design.group` and `design.prepend` target those nodes.
Condition maps select the value of the first matching expression. The literal key
`true` is the optional default, applied only after every other condition fails,
whatever its position; with no match and no default the result is null
([condition maps](expressions.md#8-condition-maps)). In every conditional
setting, including `design.show`, `design.class` and `design.style`, a string is
an expression only when it parses completely under the
[expression grammar](expressions.md); any other string is a literal, so
`class: "modal fade in show"` is class text. Dedicated conditional
metadata such as `show_if`, `display_switch`
and `display_target` is rejected in CRUDUI schemas.

### Declared attributes

A form field declares attributes of the elements CRUDUI renders for it: `design.attributes` for
its control and `design.wrapper.attributes` for its node root. The
[form markup](form-markup.md#declared-attributes) defines the elements and how renderers write
them. Each is an object of attribute name to string value; a value is literal text, not an
expression or a condition map. A name is `data-` or `aria-` followed by a lowercase letter or a
digit and then lowercase letters, digits, `-`, `_` or `.`. A name that CRUDUI writes on a control
or a node root is refused: `data-field-path`, `data-lang`, every name that starts with
`data-crudui-` or `data-source-`, `data-name`, `data-rule-name`, `data-default`,
`data-is-default`, `data-type`, `data-height`, `data-upload-server`, `data-fileserver`,
`data-server`, `data-max-tags`, `data-keyword-min-length`, `data-delay`, `data-api-server`,
`data-max-width`, `data-min-width`, `data-max-height`, `data-min-height`,
`data-preview-max-width`, `data-preview-max-height` and `data-unsupported-type`.

Only form fields accept attributes. A form button, list or detail design and the `label`,
`group` and `prepend` nodes reject `attributes` as an unknown key. Compilation checks
`design.attributes` after `design.class` and `design.style` and before the design nodes, and
`design.wrapper.attributes` after the wrapper's `class` and `style`. It checks every name in
declaration order and then every value, and fails with `INVALID_FORM_INPUT` and an empty location:

| Declaration | Message |
| --- | --- |
| Not an object | `Invalid design.attributes at {path}: expected an object` |
| A name outside the rule or a refused name | `Invalid design.attributes.{name} at {path}: expected a data-* or aria-* name that crudui does not write` |
| A value that is not a string | `Invalid design.attributes.{name} at {path}: expected a string` |

Under the wrapper the key is `design.wrapper.attributes`.

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

`items` can be a static array whose indexes are the values, a value-to-label map, a
[choice list](#choice-lists) or a dynamic source descriptor with `model`. Static labels can use
language maps. Generators preserve dynamic source settings; fetching records and executing
external widgets happen outside the generators.

### Choice lists

A choice list is an array of `{ "value": …, "label": … }` objects. Each `value` is a string or a
finite number, and the option value is its [canonical text](validation-rules.md#values): a string
itself and a number as `Number.prototype.toString` writes it. Each `label` is a label as in a
value-to-label map. The choices keep the order of the list for any values.

An `items` array is a choice list when one of its elements is an object that has a `value` member.
Every element must then be an object whose only members are `value` and `label`, every `value` must
be a string or a finite number, and no two values may have the same canonical text. Binding a field
whose `items` is a choice list that breaks one of these rules fails with `INVALID_FORM_INPUT`, the
message `Invalid items at {path}: expected value and label pairs with distinct string or number values`
and an empty location, where `{path}` is the data path of the field. The check runs before the field
type is evaluated. Select, choice, multichoice and search fields list the pairs as options in list
order, and a dummy field displays the label of its value, as they do for a value-to-label map.
[`in`](validation-rules.md#values) and the [`choice-label` format](display-formats.md#choice-label)
accept the same choice list.

Choose the form by the required order:

- A value-to-label map lists its values in [member order](#member-order), so integer-like values
  come first in ascending numeric order: `{ "1": "Yes", "0": "No" }` displays No before Yes. Use a
  map when that order is the required order, for example for values that are not integer-like.
- A choice list keeps the written order for any values: `[{ "value": 1, "label": "Yes" },
  { "value": 0, "label": "No" }]` displays Yes before No. Use it when the values are integer-like or
  mixed and the written order is required.
- An array of labels keeps the written order with the indexes `0`, `1`, … as the values.

## Composition and validation

Composition resolves `$ref`, then applies `$patch`, then processes the resulting
field definitions. Missing references are load errors. Composition does not
depend on record values. Form compilation resolves composition once per template.

A `$ref` value is one file path or a list of file paths. A list resolves each path
in declaration order and merges the results, so a later path overrides an earlier
one on a shared key; an entry that is not a string is a load error. A path may
select a fragment of a file as `(file.yml).key`. A reference resolves to the field
map of the layer it selects, which is why a declaration whose root is a bare `$ref`
is that field map and not yet a specification.

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
A list without `columns` fails with `List specification must declare columns`, and the
[display format declarations](display-formats.md#declarations) define the checks of every list and
detail declaration.

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
text. Format-specific settings stay in that object. [Display formats](display-formats.md)
defines each format, the accepted list and detail input and the markup. `sort`, `pagination`,
`search` and `actions` declare page behavior. `empty` defines translated
empty-state content and `description` translated text shown before the list. The list model
is `{ columns, rows, pagination, sort, actions, empty, description, design }`: `sort` is absent
when no sort field is declared, and `description` is the translated `description`, empty text
when none is declared. The core does not query a database, filter records or apply
server pagination. The caller supplies the current page and the total record count. When
`pagination` is enabled, the resolved model defaults `perPage` to 20, `mode` to `pages`,
and `page` to 1 when omitted. It also supplies `pageCount` (0 without a total, otherwise at
least 1, also when the total is zero). `per_page` is an integer of at least 1, and the
[display rules](display-formats.md) define the declaration checks and the page-number window.
Every renderer emits previous, numbered and next page buttons. The current page
has `aria-current="page"` and is disabled; boundary previous/next buttons are disabled.
The buttons carry `data-page`; navigation and data fetching remain the caller's responsibility.

## Details

A detail declares `fields`; one record is supplied separately to
`buildDetail(spec, record, options)`. Each field uses the same read-only display
contract as a list cell: `field`, `label`, `format` and `design`. Detail fields
share composition, conditions, appearance, content translation and cell formats
with lists, but do not declare sorting or pagination. A detail declares `actions` as a list
does. `buildDetail` returns ordered display fields, the resolved actions and the evaluated
detail design; renderers consume that model and query no data.

The model is `{ fields, actions, design }`; `actions` has the list action models in member
order and is empty when the detail declares no actions. Each field has the members `key`, `label`, `format`,
`value`, `display` and `design`, in that order: the list cell of the one record, preceded
by its key and translated label. `value` is `null` when the record has no value at the
field path, as it is for a list cell. A declaration that is not an object fails with
`Detail specification must be an object`, a declaration without `fields` with `Detail
specification must declare fields`, and a record that is not an object with `Detail record
must be an object`. Every runtime returns the same model and the same errors, and every
string renderer writes the same detail HTML as React's server rendering, including image
preload links before the definition list.

## Acceptance criteria

1. Resolve composition before evaluating fields and report missing references.
2. Keep structure, content, validation, appearance and widget options separate.
3. Evaluate conditions with the expression parser, without JavaScript evaluation.
4. Preserve language input values independently of the display language.
5. Compare shared validation cases in four languages and SSR output in three
   frameworks; verify editable form behavior with mounted views.

Repeated fields accept `multiple.min` and `multiple.max` as numeric row-count
limits, `multiple.copy` and `multiple.sortable` for row controls, `multiple.title`
for the child field whose value titles each row, `multiple.controls` for the
control position (default `header`) and `multiple.header` for static (default) or
sticky row headers. The [form markup](form-markup.md) defines their rendering.
`multiple: only`, the same as `multiple.only: true`, declares rows that exist only in the data:
the data's keys are the rows, missing data has no row, and the form offers no row controls or
row operations. `multiple.only` combines with `title` and `header` and excludes `min`, `max`,
`copy`, `sortable`, `controls` and `onclick`. Compilation reports another string as
`Invalid multiple at {path}: expected a boolean, only or an object`, a non-boolean `only` as
`Invalid multiple.only at {path}: expected a boolean`, and an excluded key beside `only: true` as
`Invalid multiple.{key} at {path}: unknown key`.
Instance collection keys identify rows; the schema does not define hidden
identity fields. See [form runtime](form-runtime.md) for row operations.

Form compilation rejects a wrong value type in `multiple`, `lang` and `design` with
`INVALID_FORM_INPUT` and the message `Invalid {key} at {path}: expected
{expected}`. `{path}` is the field's structural path, such as `companies.name`.
A condition map is a non-empty object. A button or action field takes its control
text only from `content`; `text` is not a field compatibility key. A form without `buttons` has one submit
button; a `button` or `link` needs `text` and a `link` needs `href` (see the
[form markup](form-markup.md)).

| Key | Accepted value |
| --- | --- |
| `multiple` | Boolean, `only` or object |
| `multiple.only` | Boolean |
| `multiple.min`, `multiple.max` | Number |
| `multiple.copy`, `multiple.sortable` | Boolean |
| `multiple.title` | Name of a direct child of a repeated group that is not repeated, not a group and has no `lang` |
| `multiple.controls` | `header`, `footer` or `outline` |
| `multiple.header` | `static` or `sticky` |
| `lang` | Boolean or object |
| `lang.only` | List of language-code strings or object |
| `design` | Boolean or object |
| `content` | Text or a language map; the control text of a button or action field |
| `messages` | Object of registered rule name to message string |
| `buttons` | List of buttons (`type`: `submit`, `reset`, `button` or `link`); the form root only |
| `action` | Object with string `method`, `url` and `enctype`; the form root only |
| `design.show` | Expression, boolean or condition map |
| `design.class`, `design.style` | String or condition map |
| `design.label`, `design.wrapper`, `design.group`, `design.prepend` | Object |
| `class` and `style` of those nodes | String or condition map |
| `design.attributes`, `design.wrapper.attributes` | Object of a `data-*` or `aria-*` name to a string; form fields only ([declared attributes](#declared-attributes)) |

Compilation checks fields in declaration order, each field before its children.
The schema closes `multiple`, `lang`, `design`, the design nodes and `behavior`: a key they do
not list fails with `Invalid {bucket}.{key} at {path}: unknown key` (for example
`Invalid design.label.text at name: unknown key`). Within a bucket, unknown keys are checked in
declaration order before the values. The order is `buttons` and `action`, `multiple`, `lang`,
`design` (then each node: `label`, `wrapper`, `group`, `prepend`) and `behavior`. `options`
and dynamic `items` sources stay open for type-specific settings; forbidden meta keys are
rejected everywhere. `validate` and `messages` keys are the registered rule names: the
meta-schema rejects any other name, and validation fails the load with `UNKNOWN_RULE`
([parameter errors](validation-rules.md#parameter-errors)). The meta-schema declares the parameter shapes of every registered
validation rule and rejects forbidden keys at every depth of every value it leaves open.

## Widget and source settings

`options` preserves settings for the corresponding widget. Declaration acceptance
does not mean that the core executes an external widget. Search uses
`keyword_min_length`; map descriptors use `marker_draggable`, `zoom` and
`geometry_type`; tags use `max_tags`. Label settings include `checkbox_label` and
`on_label`. Container settings include `collapse`, `expend`, `view_total`,
`stepper` and `blank_message`. `callback` and `event` preserve widget scripts.

Dynamic choice descriptors can specify `model`, `method`, `table`, `relations`,
`keys` and `api_server`. A nested `items` collection supplies initial static
choices. Queries and endpoint calls happen outside the generators.

Language configuration accepts a `mode`, an `only` language list or override map,
and group `name`, `key`, `frame`, `title` and `group_class` settings. Language
overrides can change `validate`, `design`, `behavior` and `options`.
