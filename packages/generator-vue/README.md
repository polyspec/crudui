# @form-spec/generator-vue

Vue 3 form builder for form-spec YAML definitions. Renders byte-parity output
with the legacy Limepie PHP `Generator::write()` (the golden fixtures under
`tests/fixtures/golden-html` are the single source of truth).

This package is the Vue counterpart of `@form-spec/generator-react`. It uses
plain `h()` render functions (no SFC `<style scoped>`), so SSR emits no
`data-v-*` scoped-style attributes that would break parity normalization.

## Usage (SSR)

```ts
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { FormBuilder } from '@form-spec/generator-vue';

const app = createSSRApp({
  render: () => h(FormBuilder, { spec, data: {}, language: 'ko' }),
});
const html = await renderToString(app);
```

`spec` may be a parsed spec object or a YAML string. The host page owns the
`<form>` element; `FormBuilder` renders its own
`<form class="form-builder" novalidate>` wrapper that the parity harness
strips (legacy `write()` returns form content only).

## Architecture

- `components/FormBuilder.ts` — top-level component; parses the spec, builds
  the render context, renders the legacy footer shell.
- `components/formTree.ts` — `renderFormField` (leaf dispatcher) +
  `renderFormGroup` (single / multiple groups), producing the
  `.form-element-wrapper > h6 > .form-element > .input-group-wrapper` chrome.
- `components/fields.ts` — ~30 field renderers (text/number/select/choice/
  checkbox/datetime/image/search/tinymce/button/...). Inline-JS and file
  specs render raw legacy markup via the `innerHTML` domProp.
- `limepieParity.ts`, `hooks/legacyDisplay.ts`, `hooks/legacyLang.ts`,
  `utils/*` — framework-independent PHP-cast / parser ports (adapted from
  generator-react; the cast/transform logic is framework-agnostic).
- `context.ts` — the plain (non-reactive) render context threaded through
  provide/inject. Golden fixtures are empty-data static renders, so live form
  state (setValue/validation/interactive multiple edit) is not needed for
  parity; the context exposes only the read paths (`getValue`,
  `isFieldVisible`, `t`, `keyPrefix`, `language`).

## Parity

`test/parity.test.mjs` renders the 7 golden specs through `@vue/server-renderer`
and compares against the goldens via `tests/parity/normalize.js` (the same
normalizer the React harness uses, imported read-only). Run it with:

```
cd packages/generator-vue && npx vitest run
```

Current state: 7/7 fixtures `overall: MATCH` (full canonical equality —
fields + chrome).
