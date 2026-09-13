/** Structure map model derived from evaluated nodes. */

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

/** One collection in the structure map. */
export interface OutlineCollection {
  /** Collection data path. */
  path: string;
  /** Collection label. */
  label?: string;
  /** Collection row count text. */
  count?: string;
  /** Empty collection controls placed in the map. */
  controls?: ControlsVM;
  /** Rows in data order. */
  rows: OutlineRow[];
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
  /** Collections nested in the row. */
  collections: OutlineCollection[];
}

/** Collections at this level, looking through plain groups. */
function collections(nodes: readonly NodeVM[] | undefined, selection?: RowSelection): OutlineCollection[] {
  return (nodes ?? []).flatMap((node): OutlineCollection[] => {
    if (node.kind === 'group') return collections(node.children, selection);
    if (node.kind !== 'collection' || node.path === undefined) return [];
    const path = node.path;
    return [{
      path,
      ...(node.header?.label !== undefined ? { label: node.header.label } : {}),
      ...(node.header?.count !== undefined ? { count: node.header.count } : {}),
      ...(node.controls?.placement === 'outline' ? { controls: node.controls } : {}),
      rows: (node.children ?? []).map((row): OutlineRow => {
        const current = selection?.path === path && selection.key === row.key;
        return {
          path,
          key: row.key ?? '',
          ...(row.header?.number !== undefined ? { number: row.header.number } : {}),
          ...(row.header?.title !== undefined ? { title: row.header.title } : {}),
          current,
          ...(current && row.controls?.placement === 'outline' ? { controls: row.controls } : {}),
          collections: collections(row.children, selection),
        };
      }),
    }];
  });
}

/** Build the structure map for the current nodes and selection. */
export function buildOutline(nodes: readonly NodeVM[], selection?: RowSelection): OutlineCollection[] {
  return collections(nodes, selection);
}
