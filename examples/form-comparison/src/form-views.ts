// The types that the adapters (src/adapters) and the stage pages (src/pages) share: the containers of the form page, the
// record data, the options of a list and the view state that bindFormController passes on each load.
import type { BuildListOptions } from '@polyspec/crudui-generator-core';

/** The three containers of the form page: the form, its structure map and its data panel. */
export interface FormViews {
  readonly form: HTMLElement;
  readonly outline: HTMLElement;
  readonly data: HTMLElement;
}

/** The data of a record, as the form servers send it. */
export type RecordData = Record<string, unknown>;

/** The rows of a form that render collapsed. */
export interface RowView {
  readonly collapsed: ReadonlySet<string>;
}

/** The view state of a bindForm load: the collapsed rows and whether undo is enabled; bindFormController has no redo. */
export interface BindView extends RowView {
  readonly canUndo: boolean;
}

/** The state before any change: no row is collapsed and nothing can be undone. */
export const emptyView: BindView = { collapsed: new Set<string>(), canUndo: false };

/** The options of the list of the stage: the options of buildList and the layout of the list components. */
export interface StageListOptions extends BuildListOptions {
  readonly layout: 'table' | 'card';
}
