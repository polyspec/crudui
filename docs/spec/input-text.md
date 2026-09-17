# Input text

[한국어](input-text.ko.md).

Text in specifications and data is a sequence of Unicode scalar values: code points
U+0000 to U+D7FF and U+E000 to U+10FFFF. Every runtime applies the rule below at the same
operations, in the same order, with the same failures. Text that breaks it is rejected. It is
never replaced, for example with U+FFFD, and never passed on to a result.

## Invalid text

| Runtime value | Invalid text |
| --- | --- |
| JavaScript string | A surrogate code unit that is not part of a high and low pair |
| PHP, Go and C string | Bytes that are not UTF-8, including an encoded surrogate, an overlong form and a value above U+10FFFF |
| Rust `String` | None; the type holds only Unicode scalar values |
| JSON text | A `\u` escape of a surrogate that is not part of a high and low pair, such as `"\ud800"` or the reversed pair `"\udc00\ud800"` |

The rule covers every string value and every object member name at any depth. Numbers,
booleans and `null` hold no text.

## Operations and order

Each operation checks its text before any other check, including the argument shape checks.
It checks, in this order:

1. The specification, then the composition files it reads.
2. Its other arguments, in the order of the table.
3. Its options, in code point order of their names.

| Operation | Specification | Other arguments | Options |
| --- | --- | --- | --- |
| `validate` | `spec`, `files` | `data` | `basepath` |
| `validateList`, `validateDetail` | `spec`, `files` | | `basepath` |
| `compileForm` | `spec`, `files` | | `basepath`, `keyPrefix` |
| `bindForm`, `bindButtons`, `createForm` | | `template`, `data` | `idPrefix`, `keyPrefix`, `language`, `unsupported` |
| `buildList`, `renderList` | `spec`, `files` | `rows` | `basepath`, `data`, `language`, `layout` |
| `buildDetail`, `renderDetail` | `spec`, `files` | `record` | `basepath`, `data`, `language`, `layout` |
| Form `setData` | | `data` | |
| Form `setValue` | | `path`, `value` | |
| Form `getValue` | | `path` | |
| Form `addRow` | | `path` | `afterKey`, `key`, `value` |
| Form `copyRow` | | `path`, `key` | `afterKey`, `key` |
| Form `removeRow`, `moveRow` | | `path`, `key` | |
| Form `rekeyRow` | | `path`, `oldKey`, `newKey` | |

The names are the documented argument and option names; each runtime's own spelling, such as
`KeyPrefix` in Go or `key_prefix` in Rust, reports the same name. An option that the caller does
not give is not checked. An operation that composes with a custom loader instead of `files`
checks each document when the loader returns it.

Within one value the check visits array items in index order. For an object it first checks
every member name, then visits the members in code point order of their names. The first
invalid text found is reported.

## Failures

A failure in the specification or a composition file is a composition load failure:

- code `INVALID_TEXT`;
- message `Text must be Unicode scalar values`;
- location: the path of the string joined with `.`, where an array item is its index. An invalid
  member name is located at the object that holds it. In a file, the path starts with the file
  name. An invalid file name, and an invalid member name of the specification root, are located
  at the empty path.

A failure in any other argument or option is an input failure:

- code `INVALID_FORM_INPUT`;
- message `Text must be Unicode scalar values: {name}`, where `{name}` is the argument name, or
  `options.` and the option name, followed by the path inside the value, for example
  `data.rows.k1.name` or `options.data.admin`;
- an empty location.

| Runtime | Load failure | Input failure |
| --- | --- | --- |
| JavaScript | `ComposeLoadError` | `FormInputError` |
| PHP and PHP extension, validation | `ComposeLoadError` | `FormInputError` |
| PHP and PHP extension, generation | `ComposeLoadError` | `FormError` |
| Go | `*compose.ComposeLoadError` | validation `*validate.FormInputError`; generation an error with the message |
| Rust | `ComposeLoadError` in `ValidateError::Load` or `FormError` | `FormInputError` in `ValidateError::Input` or `FormError` |

## JSON text

A JSON decoder that replaces or refuses an unpaired surrogate escape cannot hand the text to the
rule, so each runtime reads JSON text with a decoder that keeps it:

- JavaScript: `JSON.parse` keeps each escape as a code unit.
- Go: `compose.DecodeOrdered`, `generator.DecodeJSON` and the `ValidateJSON`,
  `ValidateListJSON` and `ValidateDetailJSON` entries keep an escaped surrogate as its three
  bytes and keep bytes that are not UTF-8, so the check reports both. `encoding/json` alone
  replaces them. `compose.DecodeRawMembers` splits an object without decoding its values.
  `generator.CheckBindText` checks a decoded template before `FormTemplate` decoding, whose JSON
  encoding would replace invalid text.
- PHP: `CRUDUI\Validator\Support\JsonText::decode` returns what
  `json_decode($json, false, 512, JSON_THROW_ON_ERROR)` returns and keeps an escaped surrogate as
  its three bytes. The class has no dependencies.
- Rust: `crudui_validator::text::JsonText` reads the text without replacing anything.
  `validate_text`, `validate_list_text` and `validate_detail_text` run the validation entries
  over it, and `crudui_generator::text` holds the checks of the generation entries.

JSON text is UTF-8. A program that reads a JSON request rejects input that is not UTF-8 as
invalid JSON before decoding it.

## Shared cases

[`tests/fixtures/text-validity`](../../tests/fixtures/text-validity/README.md) holds one case
file for each operation. Byte strings that JSON text cannot carry are checked by each byte
string runtime's own tests.
