/**
 * CRUDUI evaluation core (framework-agnostic) — compose + evaluate, markup 0.
 *
 * The single source of truth shared by every framework adapter (React/Vue/
 * Svelte). It runs the four mandated stages WITHOUT emitting markup:
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-ts composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, never a render) → (3) resolve `design` slots + condition
 *   maps via the shared expr engine + resolve i18n CONTENT via t() → (4) build a
 *   `FieldViewModel[]` tree (group/multiple/lang/leaf, explicit row identity,
 *   per-widget evaluated attributes/items/scripts).
 *
 * The adapter takes the returned `FieldViewModel[]` and assembles the element
 * tree (JSX / h() / .svelte) — it recomputes nothing. compose + expr are reused
 * from validator-ts; the evaluation lives here, once. eval is never called.
 */

export { compileForm, bindForm } from './form';
export type { FormTemplate, FormFieldTemplate, CompileFormOptions, BindFormOptions } from './form';
export { FormInstance, createForm, createRowKey, sequenceRowKey } from './instance';
export type { CreateFormOptions, FormSnapshot, AddRowOptions } from './instance';
export { connectForm } from './dom';

export type { FieldViewModel, UnsupportedMode, RowVM, LangChildVM, UnsupportedVM, BuildState } from './viewmodel';
export type { WidgetModel, WidgetCtx, Attrs, Affix, OptionModel } from './widget';
export { WIDGET_COUNT, WIDGET_KINDS, WIDGET_LAYOUTS, WIDGET_CANONICAL, hasWidget } from './widget';

// Shared framework-agnostic surfaces (the single source every adapter consumes).
export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from './errors';
export { resolveDesign } from './design';
export type { ResolvedDesign, ResolvedNode } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export type { Evaluated } from './expr';
export { makeTranslate } from './content';
export type { Language, LocalizedText, Translate } from './content';

// list-spec (read sister) — buildList + the read cell renderer (additive; the
// form/write surfaces above are untouched). SPEC §9.
export { buildList } from './list';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  RowVM as ListRowVM,
  PaginationVM,
  SortVM,
  ActionVM,
  BuildListOptions,
} from './list';
export {
  renderCell,
  normalizeFormat,
  CELL_RENDERERS,
  CELL_FORMATS,
  CELL_FORMAT_DEFAULT,
} from './cell';
export type {
  CellFormatModel,
  CellDisplay,
  CellRenderCtx,
  CellRenderer,
  BadgeDisplay,
  LinkDisplay,
  ImageDisplay,
  BoolDisplay,
  HtmlDisplay,
} from './cell';
