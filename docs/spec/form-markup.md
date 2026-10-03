# Form markup

[한국어](form-markup.ko.md). This document defines how evaluated form nodes are
rendered. React, Vue, Svelte, the HTML renderer and the native renderers produce
the same markup. Data, row operations and view state are defined in the
[form runtime](form-runtime.md).

## Class names

A class name has one of three forms. Each separator has one meaning.

| Form | Meaning | Example |
| --- | --- | --- |
| `crudui-{block}` | Block: an independent component | `crudui-node`, `crudui-controls` |
| `crudui-{block}__{element}` | Element (`__`): a part that exists only inside its block | `crudui-node__header`, `crudui-node__label` |
| `crudui-{block}--{modifier}` | Modifier (`--`): a kind or variant of the block | `crudui-node--row`, `crudui-node--sticky` |

Words inside a name are joined by one hyphen (`lang-item`). A modifier is always
used together with its block class (`class="crudui-node crudui-node--row"`).
An element name has one level; elements have no modifiers. Classes carry style
only: browser behavior reads the data and ARIA attributes below, never classes.
Widgets follow the same forms; the only other classes a renderer writes are
`valid-target` and `valid-target-async`, which mark validated controls, the editor
hosts `tinymcearea`, `summernote`, `contentjs` and `tuiarea`, and the classes a
spec declares in `design`.

## Blocks and attributes

| Block | Structure |
| --- | --- |
| `crudui-form` | Form root with the `crudui-form__description` paragraph of a non-empty root description, `crudui-form__errors` holding a `crudui-form__error` paragraph per form error, `crudui-form__body` and `crudui-form__footer` holding the form buttons. |
| `crudui-node` | One data node; see the kinds below. |
| `crudui-controls` | A button group with `role="group"` and an accessible name. |
| `crudui-action` | A button: an action with `data-crudui-action`, a form button or the button of a [button field](#button-fields); `crudui-action--text` shows its label as text. |
| `crudui-outline` | Structure map with `__header` form controls and `__body` nodes. |
| `crudui-data` | Current data view with `__header` and a `pre` `__body`. |
| `crudui-widget` | A control with its `__affix` prepend and append texts, a file widget's `__button` and a range widget's `__output`; `--search` holds a search select, `--range` holds a range control and `--unsupported` marks a type without a widget. |
| `crudui-input` | A native input, textarea or select; `--select` for a select, `--file` for a file input, `--range` for a range input and `--switch` for the checkbox input of a [switch](#switches). |
| `crudui-choices` | Radio (choice) or checkbox (multichoice) options: each `__input` is followed by its `__label`; `--multiple` wraps checkbox options. Each choice may add its own label class and style and input attributes ([choice appearance](#choice-appearance)). |

| Attribute | Meaning |
| --- | --- |
| `data-field-path` | Data path of field, group, collection and lang nodes, and of structure-map rows |
| `data-crudui-row-key` | Row key of a row node |
| `data-lang` | Language code of a lang-item node |
| `data-crudui-action` | Operation of a button |
| `hidden` | `design.show` is false; a collapsed row body; the summary of an expanded row |
| `aria-expanded`, `aria-controls` | Row toggle state and the controlled body |
| `step="any"` | Every number control (`number`, `integer`, `float`, `decimal`); see below |

A button's collection path is the nearest `[data-field-path]` at or above it. Its
row key is the nearest `[data-crudui-row-key]` inside that element; without one
the action applies to the collection.

Validation rules are not written as native constraint attributes; the
[validation rules](validation-rules.md) decide validity. A number control carries
`step="any"` so native constraint validation accepts every number: without it the
default step of 1 counts from the `value` attribute, and a stored value such as
`2886.5` would make every whole number a step mismatch. The `step` rule owns
increments. A [range control](#range-fields) is the one exception.

## Nodes

Every data node is `crudui-node` with one kind modifier and the slots
`crudui-node__header`, `crudui-node__body`, `crudui-node__errors` and `crudui-node__footer`, in
that order. The header is present only with content, the errors slot only with errors (one
`crudui-node__error` paragraph per message, see [complete form](form-runtime.md#complete-form))
and the footer only with controls. Child nodes are
placed only in the body, header parts only in the header, and controls only in
the header or footer. `design.wrapper` applies to the node root, `design.label`
to the header, `design.group` to the body of a group or group row and to the `crudui-choices`
element of a choice or multichoice field, `design.class`
to the control and `design.prepend` to the widget prepend.

| Kind | Header | Body |
| --- | --- | --- |
| `field` | `__label` and `__description` | Widget; the node has `crudui-node--inline` in an inline [layout](#layout) |
| `group` | `__label` and `__description` | Child nodes; the node has `crudui-node--line` when it declares the line layout, and also `crudui-node--inline` in an inline layout |
| `collection` | `__label`, `__description` and `__count` | Row nodes; the footer holds the `add-row` control when there are no rows |
| `row` | Toggle, `__label`, `__number`, `__title`, `__summary`, controls | Widget of a scalar row, or child nodes of a group row |
| `lang` | `__label`, `__description` and `__title` (`lang.title`) | lang-item nodes; the node has `crudui-node--framed` when `lang.frame` is true (the default) |
| `lang-item` | `__label` with the language code | Widget |

A label is a `label` element targeting the control when the body has exactly one
label target; otherwise it is a `span`. A checkbox or switcher caption is the
input's own label inside the body, and its header holds only a description. A
`hidden` field has no header. A row with `language: 'en'`:

```html
<div class="crudui-node crudui-node--row" data-crudui-row-key="__0000000000001__">
  <div class="crudui-node__header">
    <button type="button" class="crudui-action" data-crudui-action="toggle-row"
      aria-expanded="true" aria-controls="crudui:companies.__0000000000001__:body" aria-label="Expand or collapse"></button>
    <span class="crudui-node__label">Company</span>
    <span class="crudui-node__number">1</span>
    <span class="crudui-node__title">ACME</span>
    <span class="crudui-node__summary" hidden="">Nested rows: 2</span>
    <div class="crudui-controls" role="group" aria-label="Row controls">…</div>
  </div>
  <div class="crudui-node__body" id="crudui:companies.__0000000000001__:body">…</div>
</div>
```

## Declared attributes

A field declares attributes for its control with `design.attributes` and for its node root with
`design.wrapper.attributes` ([schema](schema.md#declared-attributes)). The control is the element
that `design.class` targets: the input, select or textarea of a widget, the file input of an
image, file or cover field, the `div` of a display field (`dummy`, `image-viewer`), the button of
a button or action field and the input of a checkbox or switcher. For a choice or multichoice field, whose
`design.class` targets the option labels, the control is every option input. A field with `lang`
writes the control attributes on the control of every language item, and a repeated scalar field
on the control of every row. The root of a `field`, `group`, `collection` or `lang` node takes the
wrapper attributes; `row` and `lang-item` nodes take none. A dynamic choice source renders no
option input and therefore no control attributes.

The models carry the declared attributes in declaration order:

- A node model has them as `attributes` after `style` and before `hidden`.
- A checkbox model has them as `attributes` after `caption`.
- A widget model appends them to the attribute list of its control: `attrs`, or `extra.file` for a
  `file` layout. A `choices` layout keeps them in `extra.option` after `extra.input`.

Each member is present only when the declaration has at least one attribute. Every renderer writes
the declared attributes after the attributes CRUDUI writes on the element, in declaration order:
after `hidden` on a node root, and after `data-is-default` and `checked` on an option input that
has behavior attributes. React's server rendering is the reference serialization, so two
placements of the reference apply: a control without behavior attributes writes `style` after
the attribute list, and an `input` without behavior attributes writes `name`, `checked` and
`value` last. For example, a text field with `design.attributes: { data-setting: theme,
aria-describedby: theme-help }` writes:

```html
<input type="text" class="valid-target crudui-input" data-name="theme" data-rule-name="theme"
  data-default="" id="crudui:theme" data-setting="theme" aria-describedby="theme-help"
  name="theme" value=""/>
```

## Layout

A group declares the layout of its fields with `design.layout` ([schema](schema.md#layout)). The
node model writes the layout as modifiers at the start of the root class (`className`), before the
`design.wrapper` class, as it writes `crudui-node--framed`:

- A field node in an inline layout has `crudui-node--inline`.
- A group that declares `line` has `crudui-node--line`, preceded by `crudui-node--inline` when the
  group is in an inline layout.

The stylesheet lays an inline node out as a grid of the label column (`--crudui-label-width`) and the
control column. The header takes no box (`display: contents`), so the label is in the label column
and the description in the control column below the body, followed by the errors; a class or style
of `design.label` that draws a box around the header therefore has no box to draw on. The label is
at least one control high and centers its text on the first line of the control. A line group places
the child nodes of its body in one wrapping row; each child is as wide as its content, and a child
declares `design.wrapper.style: "flex: 1"` to take the remaining width. The example of the schema
writes:

```html
<div class="crudui-node crudui-node--field crudui-node--inline" data-field-path="appearance.theme">
  <div class="crudui-node__header"><label class="crudui-node__label"
    for="crudui:appearance.theme">Theme</label><p class="crudui-node__description">Applies to every
    window.</p></div>
  <div class="crudui-node__body">…</div>
</div>
<div class="crudui-node crudui-node--group crudui-node--inline crudui-node--line"
  data-field-path="appearance.font">
  <div class="crudui-node__header"><span class="crudui-node__label">Font</span></div>
  <div class="crudui-node__body"><div class="crudui-node crudui-node--field"
    data-field-path="appearance.font.family">…</div>…</div>
</div>
```

## Choice appearance

A choice of a choice or multichoice field may declare `class`, `style` and `attributes`
([schema](schema.md#choice-appearance)). The label of the choice takes the class after its label
classes (`crudui-choices__label` and `design.class`) and the style after the class. The input of the
choice takes the attributes after the field's control attributes; a name declared in both keeps the
position of the field's attribute and takes the choice's value. The `crudui-choices` element takes
the class of `design.group` after its own classes and the style of `design.group`. An option model
has the members `className`, `style` and `attributes` after `id`, each present only when declared;
`style` is normalized as a design style is. With the data `accent: green`, the example of the schema
writes:

```html
<div class="crudui-choices swatches"><input data-name="accent" data-rule-name="accent" type="radio"
  autoComplete="off" class="valid-target crudui-choices__input" id="crudui:accent:0"
  data-is-default="" aria-label="Blue accent" name="accent" value="blue"/><label
  for="crudui:accent:0" class="crudui-choices__label swatch"
  style="--swatch-bg:#1d4ed8"><span>Blue</span></label><input data-name="accent"
  data-rule-name="accent" type="radio" autoComplete="off" class="valid-target crudui-choices__input"
  id="crudui:accent:1" data-is-default="" name="accent" checked="" value="green"/><label
  for="crudui:accent:1" class="crudui-choices__label swatch"
  style="--swatch-bg:#15803d"><span>Green</span></label></div>
```

## Range fields

A `range` field ([schema](schema.md#range-fields)) renders a `crudui-widget crudui-widget--range`
widget: the prepend affix, an `input` of type `range`, a `crudui-widget__output` `output` element
for that input and the append affix, which names the unit. The input has the class
`valid-target crudui-input crudui-input--range` and the `min`, `max` and `step` attributes, the
canonical texts of `validate.range` and `validate.step`. They are the only validation parameters
written as native attributes: a slider has no positions without them, and every position it
offers passes the `range` and `step` rules. The output shows the value the form was rendered with;
a renderer that renders again after a change, as `connectForm` does, shows the new value. An empty
value is written as an empty `value`, which the browser shows at the middle of the bounds, and an
empty output.

The widget model has the layout `range`, the tag `input`, the input attributes as `attrs` and the
output text as `text`. A field `volume` with `default: 50`, `append: "%"` and
`validate: { range: [0, 100], step: 5 }` writes:

```html
<div class="crudui-widget crudui-widget--range"><input type="range" min="0" max="100" step="5"
  class="valid-target crudui-input crudui-input--range" data-name="volume" data-rule-name="volume"
  data-default="50" id="crudui:volume" name="volume" value="50"/><output
  class="crudui-widget__output" for="crudui:volume">50</output><span
  class="crudui-widget__affix">%</span></div>
```

## Switches

A `switcher` field renders a switch. Its node model has the `checkbox` model of a checkbox field
with the member `role: "switch"` after `checked`, and the control class
`valid-target crudui-input crudui-input--switch` followed by the class of `design.class`. A
checkbox field has no `role` member and the control class `valid-target` followed by the class of
`design.class`. The input of a switch keeps `type="checkbox"`, so the form submits and binds it as
a checkbox, and has `role="switch"`, so assistive technology announces it as on or off. Every
renderer writes `role` after `type` and the declared attributes after `role`. The caption is the
input's own label, as for a checkbox. A field `sync` with the label `Sync` and the data
`sync: true` writes:

```html
<div class="crudui-node__body"><input class="valid-target crudui-input crudui-input--switch"
  id="crudui:sync" type="checkbox" role="switch" name="sync" checked="" value="1"/><label
  for="crudui:sync">Sync</label></div>
```

The stylesheet draws the input as a track with a round thumb at its start: the track has the
`--crudui-control-border` border and the `--crudui-subtle` background, and the thumb has the
`--crudui-surface` color. When the switch is on, the track has the `--crudui-accent` border and
background and the thumb is at its end. A focused switch has a 2px `--crudui-accent` outline.

## Button fields

A `button` field, or its alias `action`, renders one `button` element in the node body. The button
has `type="button"`, the class `crudui-action crudui-action--text` followed by the class of
`design.class`, the style of `design.style`, the `id` of the control, the event attributes of
`behavior` and the declared attributes, in that order, and the `content` text of the field as its
escaped content. A `behavior` script, such as `onclick`, is an event attribute of the button as it
is of every other control, so a click runs it; CRUDUI writes no script, no hidden input and no
`name` for the field, and the field submits no value. A button without event attributes writes its
`style` last, and a button with event attributes is written with its attributes as declared, as
every control is ([declared attributes](#declared-attributes)).

The widget model has the layout `button`, the tag `button`, the button attributes as `attrs` and
the content text as `text`. A field with a label has a header whose label targets the button. A
field without a label has no header, and in an inline [layout](#layout) its button starts the
control column as every other control does. The stylesheet makes the button as wide as its content
and as high as the other controls (`--crudui-control-height`). A field `run` with the label
`Sync`, the content `Run now` and `behavior: { onclick: "sync()" }` writes:

```html
<div class="crudui-node crudui-node--field" data-field-path="run"><div class="crudui-node__header"><label
  class="crudui-node__label" for="crudui:run">Sync</label></div><div class="crudui-node__body"><button
  type="button" class="crudui-action crudui-action--text" id="crudui:run"
  onclick="sync()">Run now</button></div></div>
```

## Rows

- The number joins the one-based positions of the enclosing rows with `.`.
- `multiple.title` names a direct child whose value becomes the row title. An
  empty value shows the untitled message.
- Group rows are collapsible. The summary counts the rows of the collections
  directly in the row body, or shows the collapsed message when there are none.
  Scalar rows have no toggle, title or summary.
- Rows of a `multiple: only` collection have no row controls, and the structure map shows none
  for them.
- Controls follow this order: `move-up` and `move-down` (`multiple.sortable`),
  `add-row`, `copy-row` (`multiple.copy`) and `remove-row`. `move-up` is unavailable
  on the first row and `move-down` on the last. `add-row` and `copy-row` are
  unavailable when the row count reaches `multiple.max`; `remove-row` when it is at
  or below `multiple.min`.
- Every action button (`data-crudui-action`), in the form and in the structure map,
  marks an unavailable action with `aria-disabled="true"`, never `disabled`. It stays
  focusable and a click on it does nothing. A focused control that becomes disabled
  keeps focus in Chromium and loses it in WebKit, so `disabled` would make focus
  depend on the browser and on rendering timing. Field controls keep `disabled`,
  which is declared data state and excludes the field from submission.
- `multiple.controls` places row controls in the row `header` (default) or
  `footer`. With `outline` the row controls move to the structure map lines; an
  empty collection's Add control is not a row control and stays in the collection
  footer.
- `multiple.header: sticky` adds `crudui-node--sticky`, and the row root style sets
  `--crudui-sticky-depth` to the number of enclosing sticky rows. The row's sticky
  line is that depth times `--crudui-node-header-height` less one row border
  (`--crudui-row-border`). Sticky rows are CSS only, so they behave the same wherever
  the form scrolls: in a page, a frame or a scrolling box. The header container pins
  on the line and has exactly the header height, border included, without wrapping
  (a long title is truncated). The line under a header is the header's own bottom
  border, inside the container, so a pinned container lands on the line of the
  container above it and pinned levels share that one border. A sticky row has no top
  border of its own: its card top edge is drawn inside the header container, the box
  that pins, and goes while the container is stuck, when the line of the container
  above is the seam. A row arriving on the line puts its own edge on that same line,
  so a seam is one border wide wherever a row rests and nothing is covered. The level
  label shows, and the card top edge goes, only while the container is stuck, by a
  `scroll-state(stuck: top)` container query. In a browser without scroll-state
  queries (Firefox, Safari), `connectForm` sets `data-crudui-stuck` on a header
  container while sticky positioning moves it from the top of its row, and the
  stylesheet shows the label and hides the card top edge from that attribute. That
  attribute is the only thing a script changes; it never measures rows for layout or
  moves a scroll position. A control inside a sticky row has a top scroll margin of
  the headers pinned above it (`--crudui-sticky-cover`, the line plus one header
  height), and every form control has a bottom scroll margin of the footer height. When
  a binding moves focus it focuses without scrolling and then scrolls the control into
  view only as far as needed (`scrollIntoView` with `block: 'nearest'`), which keeps to
  those margins in every engine, so the control lands clear of them.

  A sticky node wraps its header in `crudui-node__header-container`. The wrapper is
  the sticky scroll-state container and holds the card top edge; `crudui-node__header`
  remains the header content and draws the line under it. The wrapper supplies the
  sticky background and top radius while the header supplies its content layout. This
  wrapper is required so state-dependent styles target header descendants without
  changing the header's semantic slot.

## Form buttons

A spec declares form buttons at its root with `buttons`, a list of `{ type, text,
name, value, href, design, behavior }` where `type` is `submit`, `reset`, `button` or
`link`. A spec without `buttons` has one submit button. Submit and reset buttons
without `text` show the interface text for their type; a button or link needs `text`,
and a link needs `href`. `action` (`method`, `url`, `enctype`) is the submission
target, kept in the template; `renderForm` writes it on the `form` element of the
[complete form](form-runtime.md#complete-form). Both belong to the form root.

Every form ends with `crudui-form__footer`, one `crudui-controls` group whose
accessible name is the form actions text. `bindButtons(template, data, options)`
evaluates the buttons (design classes and styles follow the field design rules), and
`formButtonsHtml(buttons)` is the only markup builder: a link is an `a`, the other
types are `button` elements, with attributes in the order `type`, `class`, `style`,
`name`, `value`, `href`, `onclick`. The footer pins to the bottom of its scroll
container at `--crudui-form-footer-height`, as sticky row headers pin to the top.

## Structure map and data view

The structure map has one rule: one line per form row. `buildOutline(nodes)`
returns the form's rows, each with the rows nested in it, so the map nests exactly
as the form does; collections, counts and empty collections are not rows and stay in
the form. Each row has a `select-row` button with its number and title. A nested row body indents
one step. Its header holds `expand-all`, `collapse-all`, `undo` and `redo`
(each unavailable when its direction has no history). React, Vue and Svelte provide `Outline`
and `DataView`, and the stateless `OutlineView` and `DataPanel` (Vue: `outlineVNode`
and `dataVNode`) for data owned through `bindForm`; the HTML renderer provides `renderOutline(form)` and
`renderData(form)`, and `renderOutlineView(state, messages)` and
`renderDataPanel(data, messages)` for the same data. All four renderers
reproduce the shared [structure map fixture](../../tests/fixtures/form-outline/cases.json). `connectForm` runs actions in the form.
`connectOutline(element, form, formElement)` runs structure-map actions and focuses
the first control of the form row a `select-row` button names and scrolls it into
view clear of the sticky headers and the footer.

## Interface messages

Control labels, counts and summaries come from one message table for `ko`, `en`,
`ja` and `zh`, [`contracts/interface-messages.json`](../../contracts/interface-messages.json).
Every implementation embeds a source generated from that file and a test fails when
the embedded text differs from it, so every implementation uses the same text.
Authors do not override this text; text that belongs to the data, as a row title
that is empty, is declared by the author (see [schema](schema.md)). Binding rejects a language that is not a
string with `Language must be a string`, then a present `keyPrefix` or `idPrefix`
that is not a string with `{name} must be a string`, then an `unsupported` other
than `throw` or `marker` with `unsupported must be throw or marker`, then any other
language with `Unsupported language: {language}`. An absent or null option uses
its default.

## Styles

`@crudui/generator-core/crudui.css` is the only stylesheet a form needs: slot
layout, row cards, widgets, control icons, sticky headers, the structure map and the
data view. Every rule is scoped to a crudui block, including box sizing and hiding
`[hidden]` elements, and none depends on page styles or a CSS framework. The page
styles its own layout and nothing inside the crudui blocks.

The form, structure map, data view, list and detail share one set of `--crudui-*`
custom properties. One rule, `:where(.crudui-form, .crudui-outline, .crudui-data,
.crudui-list, .crudui-detail)`, declares their defaults with zero specificity, and no
other rule writes a color. A page themes the blocks with a rule that selects them and
sets the properties, for example `.crudui-form, .crudui-list { --crudui-accent: … }`;
the rule overrides the defaults in any stylesheet order.

| Property | Default | Use |
| --- | --- | --- |
| `--crudui-text` | `#111827` | text color of every block |
| `--crudui-muted` | `#6b7280` | descriptions, counts, affixes, detail labels |
| `--crudui-border` | `#e5e7eb` | borders of rows, lists, details and actions |
| `--crudui-surface` | `#ffffff` | background of controls, rows and actions |
| `--crudui-subtle` | `#f9fafb` | background of row headers, list headings, affixes and read-only controls |
| `--crudui-accent` | `#1d4ed8` | focus outlines, the selected choice and the track of an on switch |
| `--crudui-error` | `#b91c1c` | text of form and node errors |
| `--crudui-on-accent` | `#ffffff` | text of the selected choice |
| `--crudui-action-text` | `#374151` | text and icon color of actions |
| `--crudui-action-size` | `1.75rem` | width and height of an icon action, height of a text action |
| `--crudui-control-border` | `var(--crudui-border)` | borders of controls, affixes, widget buttons and choices |
| `--crudui-control-height` | `2.25rem` | minimum height of controls and choices |
| `--crudui-radius` | `0.375rem` | corner radius of controls, affixes, choices and actions |
| `--crudui-submit-background` | `var(--crudui-surface)` | background of the submit button of the form footer |
| `--crudui-submit-border` | `var(--crudui-border)` | border color of the submit button of the form footer |
| `--crudui-submit-text` | `var(--crudui-action-text)` | text color of the submit button of the form footer |
| `--crudui-label-width` | `10rem` | width of the label column of an inline layout |

`--crudui-node-header-height`, `--crudui-row-padding`, `--crudui-row-border` and
`--crudui-form-footer-height` size the sticky rows and the form footer (see above).
`tests/style-properties.test.mjs` checks the property rule, that every property a rule
reads is declared and that no other rule writes a color.

## List and detail markup

Display output uses the same block/element/modifier grammar as form output. A list
root is `crudui-list`; its description, table, headings, cells, cards, empty state, actions
and pagination use `crudui-list__description`, `crudui-list__table`, `crudui-list__heading`,
`crudui-list__cell`, `crudui-list__cards`, `crudui-list__card`, `crudui-list__empty`,
`crudui-list__actions`, `crudui-list__action` and `crudui-list__pagination`.
A pagination navigation contains buttons with `crudui-list__pagination-prev`,
`crudui-list__pagination-page` and `crudui-list__pagination-next`. Each button has
`data-page`; the current page has `aria-current="page"` and is disabled. The first
and last boundary controls are disabled. The renderer emits a bounded page-number
window for very large totals.
A detail root is `crudui-detail`; each field uses `crudui-detail__field`,
`crudui-detail__label` and `crudui-detail__value`. The actions of a detail are written before
the `crudui-detail` element in `crudui-detail__actions`, with one `crudui-detail__action` per
action ([display formats](display-formats.md#markup)).

Every displayed value also carries `crudui-value` and the closed format modifier
`crudui-value--text`, `--date`, `--number`, `--choice-label`, `--badge`, `--link`,
`--bool`, `--image` or `--html`. Badge variants are data, not class names:
`crudui-badge` carries `data-crudui-variant` when a variant is present. Boolean
presentation uses `crudui-bool` with the closed `--text`, `--check` or `--icon`
modifier and `data-crudui-state="true|false"`. CSS may style these attributes;
scripts must read the declared data and ARIA attributes, never infer behavior from
presentation classes.

## Behavior not adopted from the reference form

The reference form that motivated this grammar differs in these deliberate ways:

1. Readiness polling and time-based scroll locks are replaced by synchronization
   after rendering. Sticky headers are marked stuck on scroll and resize events,
   measured at most once per animation frame, for rows of any height.
2. Expansion is view state, not record data.
3. Rows are identified by keys, not array positions.
4. Depth is unlimited; one recursive node replaces per-depth components.
5. `multiple.max` is enforced.
6. Undo records every data change and merges consecutive edits of one path.
7. Sticky headers and their labels are CSS only; no script follows the scroll
   position, so nothing runs or renders while scrolling.
8. A row shows one number; there is no separate position counter.
9. Layout options are declared in the specification, not chosen in a panel.
