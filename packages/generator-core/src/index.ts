/** Shared form compilation, instance state, data binding and list models. */

export { compileForm, bindForm } from './form';
export type { FormTemplate, FormFieldTemplate, CompileFormOptions, BindFormOptions } from './form';
export { FormInstance, createForm, createRowKey, sequenceRowKey } from './instance';
export type { CreateFormOptions, FormSnapshot, AddRowOptions } from './instance';
export { connectForm } from './dom';

export type { FieldViewModel, UnsupportedMode, RowVM, LangChildVM, UnsupportedVM, BuildState } from './viewmodel';
export type { WidgetModel, WidgetCtx, Attrs, Affix, OptionModel } from './widget';
export { WIDGET_COUNT, WIDGET_KINDS, WIDGET_LAYOUTS, WIDGET_CANONICAL, hasWidget } from './widget';

// Shared composition, display and localization APIs.
export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from './errors';
export { resolveDesign } from './design';
export type { ResolvedDesign, ResolvedNode } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export type { Evaluated } from './expr';
export { makeTranslate } from './content';
export type { Language, LocalizedText, Translate } from './content';

// List models and cell rendering.
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
