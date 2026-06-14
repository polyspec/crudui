# @crudui/generator-react

React form builder for crudui definitions. Two surfaces:

- legacy (`src/index.ts`) — `FormBuilder` and the legacy field/group components,
  byte-parity with the Limepie PHP `Generator::write()` reference fixtures.
- CRUDUI (`src/index.ts`) — the REFERENCE adapter for the CRUDUI pipeline: compose →
  evaluate (shared `@crudui/generator-core`) → JSX SSR. Every node is a real
  JSX element (no string-builder, no `dangerouslySetInnerHTML` echo of completed
  HTML). It is the parity baseline the Vue/Svelte adapters are checked against.

## CRUDUI entry points (`src`)

- `renderForm(rootSpec, options)` → SSR HTML of the form CONTENT (no `<form>`
  wrapper). Root must be a group with `properties`; composition is expanded
  first. Throws `ComposeLoadError` on an unresolved `$ref`,
  `UnsupportedFieldTypeError` on an un-ported type.
- `renderList(listSpec, rows, options)` → SSR HTML of a list (SPEC §9, read
  sister). `rows` are INJECTED (DB-agnostic); cells are DISPLAY values, never
  inputs. `options.layout` is `'table'` (default) or `'card'`.
- Components: `Form`, `Field`, `Widget`, `List`, `Cell`. Core re-exports:
  `buildForm`, `buildList`, and the view-model types.

## legacy usage

```tsx
import { FormBuilder } from '@crudui/generator-react';

<FormBuilder spec={spec} data={{}} language="ko" />
```

`spec` accepts a parsed object or a YAML string. `FormBuilder` renders the form
CONTENT (the host page owns the surrounding chrome).

## Test

```
npm test     # vitest — legacy parity fixtures + CRUDUI render/list conformance
```
