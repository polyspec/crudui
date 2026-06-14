# @form-spec/generator-react

React form builder for form-spec definitions. Two surfaces:

- v1 (`src/index.ts`) — `FormBuilder` and the legacy field/group components,
  byte-parity with the Limepie PHP `Generator::write()` reference fixtures.
- v2 (`src/v2/index.ts`) — the REFERENCE adapter for the v2 pipeline: compose →
  evaluate (shared `@form-spec/generator-core`) → JSX SSR. Every node is a real
  JSX element (no string-builder, no `dangerouslySetInnerHTML` echo of completed
  HTML). It is the parity baseline the Vue/Svelte adapters are checked against.

## v2 entry points (`src/v2`)

- `renderFormV2(rootSpec, options)` → SSR HTML of the form CONTENT (no `<form>`
  wrapper). Root must be a group with `properties`; composition is expanded
  first. Throws `ComposeLoadError` on an unresolved `$ref`,
  `UnsupportedFieldTypeError` on an un-ported type.
- `renderListV2(listSpec, rows, options)` → SSR HTML of a list (SPEC §9, read
  sister). `rows` are INJECTED (DB-agnostic); cells are DISPLAY values, never
  inputs. `options.layout` is `'table'` (default) or `'card'`.
- Components: `FormV2`, `Field`, `Widget`, `ListV2`, `Cell`. Core re-exports:
  `buildForm`, `buildList`, and the view-model types.

## v1 usage

```tsx
import { FormBuilder } from '@form-spec/generator-react';

<FormBuilder spec={spec} data={{}} language="ko" />
```

`spec` accepts a parsed object or a YAML string. `FormBuilder` renders the form
CONTENT (the host page owns the surrounding chrome).

## Test

```
npm test     # vitest — v1 parity fixtures + v2 render/list conformance
```
