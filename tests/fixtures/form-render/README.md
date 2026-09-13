# Form rendering fixtures

[한국어](README.ko.md).

`cases.json` is shared by the React, Vue and Svelte layout conformance tests.
Each case contains a name, specification, optional data and options, and either
`expected_html` or `expectError`. The generators compare normalized output or
require the recorded composition error.

These fixtures exercise the internal `renderFields` evaluation and rendering
path. They cover appearance, conditions, composition, translated content,
language inputs, repetition and widget output. Repeated fixture data uses keyed
collections as defined in the [form runtime](../../../docs/spec/form-runtime.md).

## Normalization

`normalize.mjs` parses HTML with parse5 and inline styles with PostCSS. It sorts
attributes, canonicalizes HTML boolean attributes and CSS declarations, removes
comments and empty class/style attributes, and removes whitespace-only text
nodes outside preformatted elements. Text within `pre`, `textarea`, `script` and
`style` is preserved. Field names, row keys, IDs, values and hidden states are
not masked.

Normalized layout equality does not establish original HTML equality. The
[form inspector](../../../tests/form-inspector/form-snapshot.mjs)
compares original HTML, DOM, CSS, controls and runtime state separately for
initial data and later injection.

## Generation and verification

Run from the repository root after building the packages:

```sh
node_modules/.bin/tsx tests/fixtures/form-render/generate.ts > tests/fixtures/form-render/cases.json
node_modules/.bin/tsx tests/fixtures/form-render/gen-cases.mts
npm run test:forms
```

The generation scripts use React's internal `renderFields` helper as the layout
reference and normalize its output. The second script updates or appends widget
cases. Review generated changes before accepting them; regeneration alone is not
a correctness check. All three framework conformance suites must pass.
