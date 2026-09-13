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
| `crudui-form` | Form root with `crudui-form__body` and `crudui-form__footer` holding the form buttons. |
| `crudui-node` | One data node; see the kinds below. |
| `crudui-controls` | A button group with `role="group"` and an accessible name. |
| `crudui-action` | A button with `data-crudui-action`; `crudui-action--text` shows its label as text. |
| `crudui-outline` | Structure map with `__header` form controls and `__body` nodes. |
| `crudui-data` | Current data view with `__header` and a `pre` `__body`. |
| `crudui-widget` | A control with its `__affix` prepend and append texts and a file widget's `__button`; `--search` holds a search select and `--unsupported` marks a type without a widget. |
| `crudui-input` | A native input, textarea or select; `--select` for a select and `--file` for a file input. |
| `crudui-choices` | Radio (choice) or checkbox (multichoice) options: each `__input` is followed by its `__label`; `--multiple` wraps checkbox options. |

| Attribute | Meaning |
| --- | --- |
| `data-field-path` | Data path of field, group, collection and lang nodes, and of structure-map rows |
| `data-crudui-row-key` | Row key of a row node |
| `data-lang` | Language code of a lang-item node |
| `data-crudui-action` | Operation of a button |
| `hidden` | `design.show` is false; a collapsed row body; the summary of an expanded row |
| `aria-expanded`, `aria-controls` | Row toggle state and the controlled body |
| `aria-current="true"` | The structure map row of the current row (set by the browser binding) |
| `data-crudui-stuck` | A sticky row whose top reached its sticky line (set by the browser binding) |
| `data-crudui-current` | The current row: the last row, in document order, whose top reached its line (set by the browser binding) |

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
  `footer`. With `outline` the row controls move to the structure map lines, and the
  stylesheet shows them on the current row's line only; an empty collection's Add
  control is not a row control and stays in the collection footer.
- `multiple.header: sticky` adds `crudui-node--sticky`, and the row root style sets
  `--crudui-sticky-depth` to the number of enclosing sticky rows. The row's sticky
  line is that depth times `--crudui-node-header-height`. Three stylesheet rules
  follow from it: the header pins on the line and has exactly the header height,
  border included, without wrapping (a long title is truncated), so pinned levels
  meet without overlap; the row's `scroll-margin-top` places its header on the line,
  so `alignRow(row)` is `scrollIntoView({ block: 'start' })`; and the form's bottom
  margin, outside the form, is the height of the scroll container less the extent
  from the top of the row at the end of the form to the end of the form content, that
  row's aligned top, the footer height and the content that already follows the form
  in the scroll container, never below zero. Scrolling therefore ends exactly when its
  header reaches its line, unless the content after the form is longer than that
  space; then there is no added space and that content scrolls into view.
  The scroll container is the one the sticky headers follow: the nearest ancestor whose
  vertical overflow is `auto` or `scroll`, whether or not its content overflows yet,
  otherwise the document, so a form in a page, a frame or a scrolling box, with or
  without content after it, behaves the same. `connectRows` publishes those four
  lengths (`--crudui-scroll-height`, `--crudui-form-end-extent`,
  `--crudui-form-end-top`, `--crudui-form-end-after`) on the connected element, which
  rendering never replaces.
- `connectRows(element)` marks the form rows whose top reached their line: a sticky
  row gets `data-crudui-stuck`, and the last such row in document order (the first
  row before any) gets `data-crudui-current`. When another row becomes current it
  dispatches `crudui-current` on the element. It only writes these attributes, so
  scrolling changes no state and renders nothing. The level label shows only on a
  stuck header, and the current row has a highlighted border.

## Form buttons

A spec declares form buttons at its root with `buttons`, a list of `{ type, text,
name, value, href, design, behavior }` where `type` is `submit`, `reset`, `button` or
`link`. A spec without `buttons` has one submit button. Submit and reset buttons
without `text` show the interface text for their type; a button or link needs `text`,
and a link needs `href`. `action` (`method`, `url`, `enctype`) is the submission
target, kept in the template for the application. Both belong to the form root.

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
the form. Each row has a `select-row` button with its number and title, and the row
of the form's current row has `aria-current="true"`. A nested row body indents
one step. Its header holds `expand-all`, `collapse-all` and `undo`
(disabled when nothing can be undone). React, Vue and Svelte provide `Outline`
and `DataView`, and the stateless `OutlineView` and `DataPanel` (Vue: `outlineVNode`
and `dataVNode`) for applications that own their data with `bindForm`; the HTML renderer provides `renderOutline(form)` and
`renderData(form)`, and `renderOutlineView(state, messages)` and
`renderDataPanel(data, messages)` for the same applications. All four renderers
reproduce the shared [structure map fixture](../../tests/fixtures/form-outline/cases.json). `connectForm` runs actions in the form and tracks its rows with
`connectRows`. `connectOutline(element, form, formElement)` runs structure-map
actions, aligns the form row a `select-row` button names, and marks the current row
with `markOutline(outline, form)` whenever `crudui-current` is dispatched or the map
is rendered again. An application that renders the map next to its own form calls
`markOutline` the same way.

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

`@crudui/generator-core/crudui.css` is the only stylesheet a form needs: slot
layout, row cards, widgets, control icons, sticky headers, the structure map and the
data view. Every rule is scoped to a crudui block, including box sizing and hiding
`[hidden]` elements, and none depends on page styles or a CSS framework. The page
styles its own layout and nothing inside the crudui blocks. The form, structure map
and data view share one set of `--crudui-*` custom properties.

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
7. The current row follows the scroll position without time-based locks, and
   following it changes no state, so nothing renders while scrolling.
8. A row shows one number; there is no separate position counter.
9. Layout options are declared in the specification, not chosen in a panel.
