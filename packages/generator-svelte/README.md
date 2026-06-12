# @form-spec/generator-svelte

Svelte form builder for [form-spec](../../README.md) YAML definitions. Renders
the same Limepie-compatible markup as
[`@form-spec/generator-react`](../generator-react) and is verified byte-for-byte
against the shared golden HTML fixtures.

## Status

Implemented. Golden parity: 7/7 fixtures, 50/50 fields, chrome match (see
`test/parity.test.mjs`).

## Usage

```svelte
<script>
  import { FormBuilder } from '@form-spec/generator-svelte';

  const spec = {
    type: 'group',
    properties: {
      email: { type: 'email', label: 'Email', rules: { required: true } },
      message: { type: 'textarea', label: 'Message' },
    },
  };
</script>

<FormBuilder {spec} data={{}} language="ko" />
```

`spec` accepts a parsed object or a YAML string. `FormBuilder` renders the form
CONTENT inside a `<form class="form-builder" novalidate>` wrapper, matching the
legacy Limepie `Generator::write()` output (the host page owns the surrounding
page chrome).

Individual pieces are also exported: `FormField`, `FormGroup`, the field
components (`TextField`, `SelectField`, `CheckboxField`, ...), the
framework-independent render functions (`renderFormContent`, `renderField`,
`renderGroup`), and the parity helpers (`limepieParity`, the
`applyLangAppendTransform` / `applyDisplaySwitchTransform` render-spec
transforms).

## Architecture

The Svelte components are thin wrappers over pure HTML emitters that reproduce
the generator-react component tree at SSR time:

- `src/components/fields/limepieParity.ts` — PHP-cast helpers (copied/adapted
  from generator-react; style helpers return CSS strings for Svelte).
- `src/legacyDisplay.ts` / `src/legacyLang.ts` — the legacy render-spec
  transforms (display_switch sibling presentation, `lang: append` expansion).
- `src/fieldHtml.ts` — per-field inner-markup emitters (one per field type).
- `src/render.ts` — the FormBuilder/FormField/FormGroup structural renderer.
- `src/components/*.svelte` — Svelte components emitting the above via `{@html}`.

## Testing

```bash
npm install
npm run build
npx vitest run
```

Parity is checked against `tests/fixtures/golden-html/*` using the shared
read-only normalizer at `tests/parity/normalize.js`.
