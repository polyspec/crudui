/** Shared form compilation, instance state, data binding and list models. */

export { compileForm, bindForm } from './form';
export type { FormTemplate, FormFieldTemplate, CompileFormOptions, BindFormOptions } from './form';
export { FormInstance, createForm, createRowKey, sequenceRowKey } from './instance';
export { bindButtons, formButtonsHtml, FORM_BUTTON_TYPES, DEFAULT_FORM_BUTTONS } from './buttons';
export type { ButtonVM, FormButtonType, BindButtonsOptions } from './buttons';
export type { CreateFormOptions, FormSnapshot, AddRowOptions } from './instance';
export {
  initialView, rowPathContains, collapsibleRows, toggleRowView, setAllExpandedView, removeRowView, rekeyRowView,
} from './view';
export type { ViewState } from './view';
export { HISTORY_LIMIT, emptyHistory, recordChange, canUndo, undoChange } from './history';
export type { History, UndoResult } from './history';
export { connectForm, connectOutline } from './dom';
export type { FormConnection } from './dom';
export { resolveAction, runAction } from './actions';
export type { FormActionName, ActionTarget, ActionResult, FocusTarget } from './actions';
export { buildOutline } from './outline';
export type { OutlineRow, OutlineState } from './outline';
export { parseStyle } from './css';
export type { StyleDeclaration } from './css';

export type {
  NodeVM,
  NodeKind,
  NodeHeader,
  NodeBody,
  CheckboxVM,
  ControlsVM,
  ControlsPlacement,
  ActionVM as RowActionVM,
  RowActionName,
  UnsupportedMode,
  UnsupportedVM,
  BuildState,
} from './viewmodel';
export { LANGUAGES, formMessages, formatCount } from './messages';
export type { FormMessages } from './messages';
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
