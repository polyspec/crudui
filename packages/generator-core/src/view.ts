/** Row view state rules shared by form instances and applications that own their data. */

import type { NodeVM } from './viewmodel';

/** A selected row: its collection path and key. */
export interface RowSelection {
  /** Collection data path. */
  readonly path: string;
  /** Row key. */
  readonly key: string;
}

/** View state kept outside record data; it is never submitted or serialized with the data. */
export interface ViewState {
  /** Row paths (`{collection}.{key}`) rendered collapsed. */
  readonly collapsed: ReadonlySet<string>;
  /** Selected row, if any. */
  readonly selection?: RowSelection;
}

/** The initial view: every row expanded and no selection. Replacing the record returns to it. */
export function initialView(): ViewState {
  return { collapsed: new Set() };
}

/** Whether `path` is the row path `rowPath` or lies inside that row. */
export function rowPathContains(rowPath: string, path: string): boolean {
  return path === rowPath || path.startsWith(`${rowPath}.`);
}

/** Row paths (`{collection}.{key}`) of every collapsible row in evaluated nodes. */
export function collapsibleRows(nodes: readonly NodeVM[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === 'collection') {
      for (const row of node.children ?? []) {
        if (row.collapsible) out.push(`${node.path}.${row.key}`);
        collapsibleRows(row.children ?? [], out);
      }
    } else {
      collapsibleRows(node.children ?? [], out);
    }
  }
  return out;
}

/** Expand a collapsed row or collapse an expanded one. */
export function toggleRowView(view: ViewState, rowPath: string): ViewState {
  const collapsed = new Set(view.collapsed);
  if (!collapsed.delete(rowPath)) collapsed.add(rowPath);
  return { ...view, collapsed };
}

/** Expand every row, or collapse every collapsible row of the evaluated nodes. */
export function setAllExpandedView(view: ViewState, nodes: readonly NodeVM[], expanded: boolean): ViewState {
  return { ...view, collapsed: new Set(expanded ? [] : collapsibleRows(nodes)) };
}

/** Select a row; returns the same view object when that row is already selected. */
export function selectRowView(view: ViewState, path: string, key: string): ViewState {
  if (view.selection?.path === path && view.selection.key === key) return view;
  return { ...view, selection: { path, key } };
}

/** Drop the collapsed state and selection of a removed row and its descendants. */
export function removeRowView(view: ViewState, rowPath: string): ViewState {
  const collapsed = new Set([...view.collapsed].filter(path => !rowPathContains(rowPath, path)));
  const selected = view.selection && rowPathContains(rowPath, `${view.selection.path}.${view.selection.key}`);
  return selected ? { collapsed } : { ...view, collapsed };
}

/** Move the collapsed state and selection of a rekeyed row and its descendants to the new row path. */
export function rekeyRowView(view: ViewState, oldPath: string, newPath: string): ViewState {
  const rename = (path: string) => rowPathContains(oldPath, path) ? newPath + path.slice(oldPath.length) : path;
  const collapsed = new Set([...view.collapsed].map(rename));
  if (!view.selection) return { collapsed };
  const renamed = rename(`${view.selection.path}.${view.selection.key}`);
  const split = renamed.lastIndexOf('.');
  return { collapsed, selection: { path: renamed.slice(0, split), key: renamed.slice(split + 1) } };
}
