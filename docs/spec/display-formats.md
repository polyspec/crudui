# Display formats

[한국어](display-formats.ko.md).

Lists and details show record values; they do not edit them. A list column or a detail field
declares how its value is displayed with `format`. This page defines every declarable format,
the input a list or detail accepts and the markup it writes. Every runtime (JavaScript, the HTML
renderer, PHP, the PHP extension, Go and Rust) follows these rules exactly; the shared
[list](../../tests/fixtures/list-render/README.md) and
[detail](../../tests/fixtures/detail-render/README.md) fixtures check each rule in every runtime.
A display format that is not defined here is not part of the contract.

## How a value is displayed

1. The column or field `field` path (for example `.name` or `.company.name`) reads the value from
   the row or record. The model keeps it as `value`; a path the record does not have is `null`.
2. `format` turns the value into the `display` model: a string, or a structured value for
   `badge`, `link`, `bool`, `image` and `html`.
3. A renderer writes markup from `display` only. It does not read the record again.

A format is declarative data. There is no formatting callback, because a function written in one
language cannot run identically in the others. A value that needs application logic is computed
by the application and supplied in the record; markup the application has already produced uses
the `html` format.

```yaml
columns:
  name:   { field: .name, label: { ko: 이름, en: Name }, format: { type: link, href: /users/.id } }
  score:  { field: .score, format: { type: number, decimals: 2, thousands: true, prefix: { en: '$' } } }
  joined: { field: .joined, format: { type: date, pattern: YYYY-MM-DD } }
  status: { field: .status, format: { type: badge, map: { active: success, blocked: danger } } }
```

## Declaring a format

| Declaration | Result |
| --- | --- |
| absent, `null`, `true` or `false` | `text` |
| a string, such as `date` | that type with no settings |
| an object | its `type` (`text` when absent or empty) with the object's settings |

A type that is not in the table below displays the value as `text` and keeps the declared type
name in the cell class.

Values are read as text in this way: `null` or an absent value is empty, `true` is `1`, `false` is
empty, an object or array is empty, and a number uses the shortest decimal representation.

Settings that accept content (`prefix`, `suffix`, `text`, `true`, `false`, `alt` and badge or
choice labels) accept a string or a language map such as `{ ko: 이름, en: Name }`, translated to
the display language.

## Formats

| Type | Settings | Display |
| --- | --- | --- |
| `text` | `truncate` | The value as text. |
| `date` | `pattern` | The value formatted as a UTC date. |
| `number` | `decimals`, `thousands`, `prefix`, `suffix` | The value formatted as a number. |
| `badge` | `map` | A badge with a variant and a label. |
| `link` | `href`, `target`, `text` | A link. |
| `choice-label` | `items` | The label of the value. |
| `bool` | `true`, `false`, `as` | A true or false label. |
| `image` | `width`, `height`, `alt` | An image of the value. |
| `html` | none | The value as unescaped markup. |

### text

`truncate` limits the displayed length. Only a number applies, and its integer part is the limit.
When the limit is at least 1 and the text has more Unicode code points than the limit, the first
code points up to the limit are kept and `…` (U+2026) is appended. A character is never split. A
limit that is absent, not a number (a numeric string included) or below 1 displays the whole
text.

### date

The value is parsed with the [date value rules](form-runtime.md#date-values) and shown in UTC.
`pattern` replaces the tokens `YYYY` (year), `MM` (month), `DD` (day), `HH` (hour, 24-hour),
`mm` (minute) and `ss` (second); other characters are kept. The default pattern is `YYYY-MM-DD`.
A value that is not a supported date is displayed unchanged.

### number

A number value is used as is; a string is converted with the JavaScript `Number` rules, so
surrounding whitespace is ignored and `0x`, `0b` and `0o` prefixes are read. A value that does not
convert to a finite number is displayed unchanged.

- `decimals` fixes the number of decimal places. It must be a number; a fractional count is
  truncated toward zero, and the result must be between 0 and 100, otherwise the list or detail
  fails with `Number decimals must be between 0 and 100`. The exact binary value is rounded to the
  nearest representation with ties away from zero, so `2.5` is `3`, `-2.5` is `-3` and `1.005`
  with two decimals is `1.00`. A `decimals` value that is not a number is ignored.
- Without `decimals`, the shortest decimal representation is used; very large or very small
  values use exponent notation, such as `1e+21` and `1e-7`.
- `thousands: true` groups the integer digits with `,`.
- `prefix` and `suffix` are written before and after the number.

### badge

`map` maps a value to a variant. For a string variant, the badge has that variant and the value
is the label. For a language map, the translated text is both the variant and the label. A value
that `map` does not contain produces a badge without a variant, labelled with the value.

### link

- `href` is a string or a condition map resolved with the [expression rules](expressions.md).
  Each `.path` token in `href` is replaced with the record value at that path; `.field` is the
  cell value, and a path the record does not have is replaced with the cell value.
- `text` is the link text. When `text` is absent, `null` or empty, the cell value is the text.
- `target` is written when it is a non-empty string.
- A `javascript:` URL is replaced with a URL that throws, as React's server rendering does.

### choice-label

`items` is a map from value to label or an array whose indexes are the values. The label of the
value is displayed. A dynamic source (`{ model: … }`) is not read by the renderer, and a value
without a label is displayed unchanged.

### bool

The value is false when it is `false`, `0`, `null`, absent, the empty string, `"0"` or `"false"`,
and true otherwise. `true` and `false` are the labels for each state; without a label the text is
`true` or `false`. `as` selects `text` (the default), `icon` or `check`.

### image

The value is the image source. `alt` is translated and `.path` tokens in it are replaced as in a
link; without `alt` the alternative text is empty. A declared `width` or `height` is written as
text, and a declared `null` writes an empty attribute. An image with a non-empty source that does
not start with `data:` also adds a preload link; see [Markup](#markup).

### html

The value is written as markup without escaping. The application is responsible for the safety of
that markup.

## Input

A list receives a specification, rows and options; a detail receives a specification, one record
and options. Invalid input fails with code `INVALID_FORM_INPUT`, the message below and an empty
location.

| Input | Rule | Message |
| --- | --- | --- |
| list specification | an object | `List specification must be an object` |
| list rows | an array | `List rows must be an array` |
| each list row | an object | `List rows must be objects` |
| list `data` option | an object | `List context must be an object` |
| list `page` option | an integer from 1 to 9007199254740991 | `List page must be a positive integer` |
| list `total` option | an integer from 0 to 9007199254740991 | `List total must be a nonnegative integer` |
| list `layout` option | `table` or `card` | `List layout must be table or card` |
| detail specification | an object | `Detail specification must be an object` |
| detail specification | declares `fields` | `Detail specification must declare fields` |
| detail record | an object | `Detail record must be an object` |
| detail `data` option | an object | `Detail context must be an object` |

A detail takes the `data`, `language`, `files` and `basepath` options. It neither checks nor uses
the list-only `page`, `total` and `layout` options.

An option that is absent or `null` uses its default: an empty context, no current page, no total
and the `table` layout. `page` is the current page and `total` the total record count; the caller
supplies both, the generator derives neither from the rows, and a list whose specification
enables `pagination` writes them as `data-page` and `data-total`. The upper bound is the largest
integer every runtime represents exactly; an integral value such as `2.0` is the integer `2`. When several inputs are invalid, the first failing rule in the table order is
reported. The Go and Rust library signatures take rows as a sequence, so in those languages the
rows rule applies where decoded JSON becomes that sequence; every other rule is checked by the
library.

In PHP, the [PHP API contract](php-extension.md) decides which PHP values are objects: an empty
PHP array is accepted for a root object argument and for the fixed object options `data` and
`files`, while nested values keep their type.

## Markup

| Display | List table cell | Detail value |
| --- | --- | --- |
| text, date, number, choice-label | escaped text in `td.list-td.list-td-TYPE` | escaped text in `dd.detail-value.detail-value-TYPE` |
| badge | `span.badge.badge-VARIANT` (`span.badge` without a variant) | the same inside the `dd` |
| link | `a` with `href` and optional `target` | the same inside the `dd` |
| bool | `span.bool-text` with the label, `span.bool-icon.bool-true` or `.bool-false` with the label as `aria-label`, or `span.bool-check` with `✔` or `✘` and the label as `aria-label` | the same inside the `dd` |
| image | `img` with `src`, `alt`, and declared `width` and `height` | the same inside the `dd` |
| html | the markup, unescaped | the same inside the `dd` |

A detail is a `dl.detail-view` with one `div.detail-field` per field, each holding
`dt.detail-label` and the value. The string renderers write the image preload links
`<link rel="preload" as="image" href="…"/>` before the list or detail, in first-use order and
without duplicates.
