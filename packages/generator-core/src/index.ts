/**
 * The public application API: form compilation, instance state, data binding, list and detail
 * models, browser binding and the errors an application catches. Helpers shared by CRUDUI's own
 * renderer packages are in `./internal`.
 */

export { compileForm, bindForm } from './form';
export type { FormTemplate, FormFieldTemplate, CompileFormOptions, BindFormOptions } from './form';
export { FormInstance, createForm, createRowKey, sequenceRowKey } from './instance';
export { bindButtons, formButtonsHtml } from './buttons';
export type { ButtonVM, FormButtonType, BindButtonsOptions } from './buttons';
export type { CreateFormOptions, FormSnapshot, AddRowOptions } from './instance';
export {
  initialView, collapsibleRows, toggleRowView, setAllExpandedView, removeRowView, rekeyRowView,
} from './view';
export type { ViewState } from './view';
export { emptyHistory, recordChange, canUndo, canRedo, undoChange, redoChange } from './history';
export type { History, UndoResult, RedoResult } from './history';
export { connectForm, connectOutline, connectStickyHeaders } from './dom';
export { patchContent } from './patch';
export type { FormConnection } from './dom';
export { resolveAction, runAction } from './actions';
export type { FormActionName, ActionTarget, ActionResult, FocusTarget } from './actions';
export { buildOutline } from './outline';
export type { OutlineRow, OutlineState } from './outline';

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
export { formMessages } from './messages';
export type { FormMessages } from './messages';
export type { WidgetModel, WidgetCtx, Attrs, Affix, OptionModel } from './widget';

// Errors an application catches.
export { ComposeLoadError } from '@crudui/validator';
export { UnsupportedFieldTypeError } from './errors';
/** Invalid generator input (code `INVALID_FORM_INPUT`), shared with the validator. */
export { FormInputError } from '@crudui/validator';
export type { ResolvedDesign, ResolvedNode } from './design';
export type { Language, LocalizedText } from './content';

// List and detail models.
export { buildList } from './list';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  RowVM as ListRowVM,
  PaginationVM,
  PaginationButtonVM,
  SortVM,
  ActionVM,
  BuildListOptions,
} from './list';
export { buildDetail } from './detail';
export type { DetailViewModel, DetailFieldVM, BuildDetailOptions } from './detail';
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
