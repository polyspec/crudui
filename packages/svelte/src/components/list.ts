/**
 * CRUDUI Svelte list helpers — pure presentational string computations (NO markup).
 *
 * List.svelte owns the real table/card element tree; these helpers only map the
 * core's pre-evaluated `ListViewModel` (ColumnVM / CellVM / ResolvedDesign /
 * CellDisplay) onto the class/style values the table nodes carry, and serialize
 * the two sanctioned raw boundaries — the `html` cell display (verbatim row HTML)
 * and a row/toolbar action's behavior on* attrs. The renderer does not call eval
 * or recompute these values.
 *
 * The read sister of field.ts: where field.ts maps a write FieldViewModel's
 * design onto the form envelope, this maps a read column/cell design onto the
 * list envelope. The cell DISPATCH (text vs badge vs link …) is the structural
 * .svelte tree in List.svelte; these are only the leaf appearance/raw bits.
 */

import type {
  ColumnVM,
  CellVM,
  ActionVM,
  ResolvedNode,
} from '@polyspec/crudui-generator-core';

/** Join base class + a design node's class into one className ('' → undefined). */
function nodeClass(base: string, node: ResolvedNode | undefined): string | undefined {
  const merged = [base, node?.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
  return merged || undefined;
}

/** A design node's style trimmed ('' → undefined so the attr is omitted). */
function nodeStyle(node: ResolvedNode | undefined): string | undefined {
  const s = node?.style?.trim();
  return s || undefined;
}

/** Header cell (`<th>`) class: base + the column's resolved design class. */
export function headerClass(col: ColumnVM): string | undefined {
  return nodeClass('crudui-list__heading', col.design.main);
}

/** Header cell style. */
export function headerStyle(col: ColumnVM): string | undefined {
  return nodeStyle(col.design.main);
}

/** Body cell (`<td>`) class: base + format type + the cell's resolved design. */
export function cellClass(cell: CellVM): string | undefined {
  const base = `crudui-list__cell crudui-value crudui-value--${cell.format.type}`;
  return nodeClass(base, cell.design.main);
}

/** Body cell style. */
export function cellStyle(cell: CellVM): string | undefined {
  return nodeStyle(cell.design.main);
}

/** Sortable header marker text ('' for a non-sortable column → omit the span). */
export function sortMarker(col: ColumnVM): string {
  return col.sortable ? '↕' : '';
}

export { actionHtml, sortDir } from '@polyspec/crudui-generator-core/internal';

/** Whether the list has any toolbar actions. */
export function hasActions(actions: ActionVM[]): boolean {
  return actions.length > 0;
}
