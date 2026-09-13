/** Structure map model derived from evaluated nodes: one entry per form row. */

import type { RowSelection } from './view';
import type { ControlsVM, NodeVM } from './viewmodel';

/** What a structure map renders: evaluated nodes, selection and undo availability, such as a form snapshot. */
export interface OutlineState {
  /** Evaluated form nodes. */
  readonly fields: NodeVM[];
  /** Selected row, if any. */
  readonly selection?: RowSelection;
  /** Whether the undo control is enabled. */
  readonly canUndo: boolean;
}

/** One row in the structure map. */
export interface OutlineRow {
  /** Collection data path. */
  path: string;
  /** Row key. */
  key: string;
  /** Row number text. */
  number?: string;
  /** Row title text. */
  title?: string;
  /** Whether the row is selected. */
  current: boolean;
  /** Controls of the selected row placed in the map. */
  controls?: ControlsVM;
  /** Rows nested in this row, in data order. */
  rows: OutlineRow[];
}

/** The rows under nodes, looking through every node that is not a collection. */
function rows(nodes: readonly NodeVM[] | undefined, selection?: RowSelection): OutlineRow[] {
  return (nodes ?? []).flatMap((node): OutlineRow[] => node.kind !== 'collection'
    ? rows(node.children, selection)
    : (node.children ?? []).map((row): OutlineRow => {
      const current = selection !== undefined && selection.path === node.path && selection.key === row.key;
      return {
        path: node.path ?? '',
        key: row.key ?? '',
        ...(row.header?.number !== undefined ? { number: row.header.number } : {}),
        ...(row.header?.title !== undefined ? { title: row.header.title } : {}),
        current,
        ...(current && row.controls?.placement === 'outline' ? { controls: row.controls } : {}),
        rows: rows(row.children, selection),
      };
    }));
}

/** Build the structure map: the form's rows, nested as in the form. */
export function buildOutline(nodes: readonly NodeVM[], selection?: RowSelection): OutlineRow[] {
  return rows(nodes, selection);
}
