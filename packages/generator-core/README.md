# @crudui/generator-core

Framework-agnostic CRUDUI evaluation core — the single source of truth shared by the
React/Vue/Svelte adapters. It runs the four mandated stages WITHOUT emitting
markup, then hands a markup-free view-model tree to each adapter. compose + expr
are reused from `@crudui/validator`; eval is never called.

Pipeline: (1) CRUDUI spec → (2) compose (`$ref`/`$patch` expansion; unresolved →
`ComposeLoadError`) → (3) resolve `design` slots + condition maps via the expr
engine + i18n CONTENT via `t()` → (4) build the view-model tree.

## CRUDUI entry points

- `buildForm(rootSpec, options)` → `FieldViewModel[]`. The root must be a group
  with `properties`; composition is expanded first. Throws `ComposeLoadError`
  on an unresolved `$ref`, `UnsupportedFieldTypeError` on an un-ported type
  (default-throw mode).
- `buildList(listSpec, rows, options)` → `ListViewModel` (SPEC §9, read sister).
  `rows` are INJECTED (DB-agnostic); search/sort/pagination are declared only.
  Cells are DISPLAY values, never inputs.
- Cell layer: `renderCell`, `normalizeFormat`, `CELL_RENDERERS`, `CELL_FORMATS`,
  `CELL_FORMAT_DEFAULT` — the per-format read cell renderers (`CellDisplay`).
- Widget catalog: `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `WIDGET_CANONICAL`,
  `WIDGET_COUNT`, `hasWidget` — the single widget registry the CLI describes.
- Shared surfaces: `resolveDesign`, `evalShow`, `evalAppearance`, `makeContext`,
  `makeTranslate`, `buildField`, `ComposeLoadError`, `UnsupportedFieldTypeError`.

## Test

```
npm test     # vitest (buildForm/buildList/cell unit + conformance)
```
