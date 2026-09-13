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
Widget internals such as `input-group` and `form-control` are a separate contract.

## Blocks and attributes

| Block | Structure |
| --- | --- |
| `crudui-form` | Form root with `crudui-form__body`. |
| `crudui-node` | One data node; see the kinds below. |
| `crudui-controls` | A button group with `role="group"` and an accessible name. |
| `crudui-action` | A button with `data-crudui-action`; `crudui-action--text` shows its label as text. |
| `crudui-outline` | Structure map with `__header` form controls and `__body` nodes. |
| `crudui-data` | Current data view with `__header` and a `pre` `__body`. |

| Attribute | Meaning |
| --- | --- |
| `data-field-path` | Data path of field, group, collection and lang nodes, and of structure-map rows |
| `data-crudui-row-key` | Row key of a row node |
| `data-lang` | Language code of a lang-item node |
| `data-crudui-action` | Operation of a button |
| `hidden` | `design.show` is false; a collapsed row body; the summary of an expanded row |
| `aria-expanded`, `aria-controls` | Row toggle state and the controlled body |
| `aria-current="true"` | Selected row in the structure map |
| `data-crudui-stuck` | A sticky row header is currently stuck (set by the browser binding) |

A button's collection path is the nearest `[data-field-path]` at or above it. Its
row key is the nearest `[data-crudui-row-key]` inside that element; without one
the action applies to the collection.

## Nodes

Every data node is `crudui-node` with one kind modifier and the slots
`crudui-node__header`, `crudui-node__body` and `crudui-node__footer`. The header
is present only with content and the footer only with controls. Child nodes are
placed only in the body, header parts only in the header, and controls only in
the header or footer. `design.wrapper` applies to the node root, `design.label`
to the header, `design.group` to the body of a group or group row, `design.class`
to the control and `design.prepend` to the widget prepend.

| Kind | Header | Body |
| --- | --- | --- |
| `field` | `__label` and `__description` | Widget |
| `group` | `__label` and `__description` | Child nodes |
| `collection` | `__label`, `__description` and `__count` | Row nodes; the footer holds the `add-row` control when there are no rows |
| `row` | Toggle, `__label`, `__number`, `__title`, `__summary`, controls | Widget of a scalar row, or child nodes of a group row |
| `lang` | `__label`, `__description` and `__title` (`lang.title`) | lang-item nodes |
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

## Rows

- The number joins the one-based positions of the enclosing rows with `.`.
- `multiple.title` names a direct child whose value becomes the row title. An
  empty value shows the untitled message.
- Group rows are collapsible. The summary counts the rows of the collections
  directly in the row body, or shows the collapsed message when there are none.
  Scalar rows have no toggle, title or summary.
- Controls follow this order: `move-up` and `move-down` (`multiple.sortable`),
  `add-row`, `copy-row` (`multiple.copy`) and `remove-row`. `move-up` is disabled
  on the first row and `move-down` on the last. `add-row` and `copy-row` are
  disabled when the row count reaches `multiple.max`; `remove-row` when it is at
  or below `multiple.min`.
- `multiple.controls` places row controls in the row `header` (default) or
  `footer`. With `outline` the form renders no row or empty collection controls;
  the structure map shows them for the selected row and empty collection.
- `multiple.header: sticky` adds `crudui-node--sticky`. The header style sets
  `--crudui-sticky-depth` to the number of enclosing sticky rows. The label is
  shown only while the header is stuck.

## Structure map and data view

`buildOutline(nodes, selection)` returns the collections and rows of the nodes,
looking through plain groups. The structure map uses the node grammar: each row
has a `select-row` button with its number and title, and the selected row has
`aria-current="true"`. Its header holds `expand-all`, `collapse-all` and `undo`
(disabled when nothing can be undone). React, Vue and Svelte provide `Outline`
and `DataView`; the HTML renderer provides `renderOutline(form)` and
`renderData(form)`. `connectForm` runs actions in the form and selects a row when
one of its controls receives focus. `connectOutline(element, form, formElement)`
runs structure-map actions and scrolls the selected form row into view.

## Interface messages

Control labels, counts and summaries come from one message table for `ko`, `en`,
`ja` and `zh` ([`messages.ts`](../../packages/generator-core/src/messages.ts)).
Every implementation uses the same text. Binding rejects a language that is not a
string with `Language must be a string`, then a present `keyPrefix` or `idPrefix`
that is not a string with `{name} must be a string`, then an `unsupported` other
than `throw` or `marker` with `unsupported must be throw or marker`, then any other
language with `Unsupported language: {language}`. An absent or null option uses
its default.

## Styles

`@crudui/generator-core/styles.css` styles the grammar: slot layout, row cards,
control icons, sticky headers, the structure map and the data view. It hides
`[hidden]` elements. The form, structure map and data view share one set of
`--crudui-*` custom properties.

## Behavior not adopted from the reference form

The reference form that motivated this grammar differs in these deliberate ways:

1. Readiness polling and time-based scroll locks are replaced by synchronization
   after rendering and an IntersectionObserver for sticky headers.
2. Expansion is view state, not record data.
3. Rows are identified by keys, not array positions.
4. Depth is unlimited; one recursive node replaces per-depth components.
5. `multiple.max` is enforced.
6. Undo records every data change and merges consecutive edits of one path.
7. Scrolling does not change the selection.
8. A row shows one number; there is no separate position counter.
9. Layout options are declared in the specification, not chosen in a panel.
