# List rendering fixtures

[한국어](README.ko.md).

`cases.json` contains the shared list layout cases for React, Vue and Svelte.
Each case provides `name`, `spec`, `rows`, optional `options`, and either
`expected_html` or `expectError`.

These cases check table and card layouts, column formats, actions, visibility,
empty rows and pagination markup. Applications supply display rows and perform
queries; the renderer does not query a database.

## Comparisons

The framework layout tests compare normalized list bodies with `expected_html`.
They use the [form HTML normalizer](../form-render/README.md#normalization).
React image preload links are excluded from these body expectations. This
comparison does not establish equality of complete original HTML.

The [native generator suite](../../native-generators/README.md) uses the same
inputs and compares complete original HTML with React, including image preload
links. It does not remove resource hints or normalize attributes and CSS.

Consumers are the list conformance tests in
[React](../../../packages/generator-react/src/__tests__/list-render.conformance.test.ts),
[Vue](../../../packages/generator-vue/test/list-render.conformance.test.mjs), and
[Svelte](../../../packages/generator-svelte/test/list-render.conformance.test.mjs).
Composition error cases require the recorded error code.

## Regeneration

Run from the repository root after building the packages:

```sh
node_modules/.bin/tsx tests/fixtures/list-render/generate.ts \
  > tests/fixtures/list-render/cases.json
npm run test:forms
```

The generator derives normalized list bodies from React. Review changes against
the specification before accepting them. Regeneration alone is not verification.
