# Structure map and data view fixtures

[한국어](README.ko.md).

`cases.json` contains the shared structure map and data view cases for React, the HTML renderer,
Vue and Svelte. Each case provides `name`, `note`, `spec`, `data`, `options` with `language`,
`canUndo`, `canRedo`, `expected_outline_html` and `expected_data_html`.

These cases check the map of top-level and nested rows with undo available, row controls placed in
the map with `controls: outline` while empty collection controls stay in the form, untitled rows,
a form without repeated fields, rows of a `multiple.only` collection that have no row controls in
the map while their enclosing rows keep theirs, markup characters escaped in the data view, and the
interface messages in Korean, English, Japanese and Chinese. The [form markup](../../../docs/spec/form-markup.md)
defines both views.

## Comparisons

The fields of a case are `bindForm(compileForm(spec), data, options)`. Each renderer draws the
structure map from `{ fields, canUndo, canRedo }` and the data view from `data`, normalizes both with the
[form HTML normalizer](../form-render/README.md#normalization) and must return exactly
`expected_outline_html` and `expected_data_html`. React renders `OutlineView` and `DataPanel`, the
HTML renderer `renderOutlineView` and `renderDataPanel`, Vue `outlineVNode` and `dataVNode` through
its server renderer, and Svelte `OutlineView` and `DataPanel` through `svelte/server`.

Consumers are the structure map conformance tests in
[React](../../../packages/generator-react/src/__tests__/outline.conformance.test.tsx),
[Vue](../../../packages/generator-vue/test/outline.conformance.test.mjs),
[Svelte](../../../packages/generator-svelte/test/outline.conformance.test.mjs) and the
[HTML renderer](../../../packages/generator-html/src/outline.conformance.test.ts). The
[form markup naming test](../../form-markup/naming.test.mjs) checks the class names in both
expected HTML strings.

## Regeneration

Run from the repository root after building the packages:

```sh
node_modules/.bin/tsx tests/fixtures/form-outline/generate.ts
npm run test:forms
```

The generator writes `cases.json` itself from the normalized static markup of React's
`OutlineView` and `DataPanel`; a structure map declared on a case (`outline-only-rows-en`) is
written from the specification and kept as written. Review changes against the specification before accepting them.
Regeneration alone is not verification.
