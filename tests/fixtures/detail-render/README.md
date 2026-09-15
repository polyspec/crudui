# Detail rendering fixtures

[한국어](README.ko.md).

`cases.json` contains the shared read-only detail cases for every string renderer and every
framework renderer. Each case provides `name`, `note`, `spec`, `record`, optional `options`, and
either `expected_html` or `expectError` with its `code` and `message`.

These cases check translated labels, every cell format, an absent value, the detail and field
designs, a hidden field, composed fields, an empty declaration and the three input errors.
Applications supply the record; the renderer does not query data.

## Comparisons

The framework conformance tests compare the normalized detail body with `expected_html`, using
the [form HTML normalizer](../form-render/README.md#normalization). The string renderers
(React's server rendering and the HTML renderer) write image preload links before the detail;
[`preload-links.mjs`](../preload-links.mjs) removes them, so the body expectations cover the
detail body only. Error cases require the recorded message.

The [native generator suite](../../native-generators/README.md) sends every case to every
runtime at both levels a runtime exposes: `buildDetail` must return the same model with members
in the same order, and `renderDetail` must return the same complete original HTML as React,
image preload links included. A field's `value` is `null` when the record has no value at its
path.

Consumers are the detail conformance tests in
[React](../../../packages/generator-react/src/__tests__/detail-render.conformance.test.ts),
[Vue](../../../packages/generator-vue/src/__tests__/detail-render.conformance.test.ts),
[Svelte](../../../packages/generator-svelte/test/detail-render.conformance.test.mjs) and the
[HTML renderer](../../../packages/generator-html/src/detail-conformance.test.ts).

## Regeneration

Run from the repository root:

```sh
node_modules/.bin/tsx tests/fixtures/detail-render/generate.ts \
  > tests/fixtures/detail-render/cases.json
```

The generator derives normalized detail bodies from React. Review changes against the
specification before accepting them. Regeneration alone is not verification.
