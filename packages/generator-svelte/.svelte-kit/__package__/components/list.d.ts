/**
 * CRUDUI Svelte list helpers — pure presentational string computations (NO markup).
 *
 * List.svelte owns the real table/card element tree; these helpers only map the
 * core's pre-evaluated `ListViewModel` (ColumnVM / CellVM / ResolvedDesign /
 * CellDisplay) onto the class/style values the table nodes carry, and serialize
 * the two sanctioned raw boundaries — the `html` cell display (verbatim row HTML)
 * and a row/toolbar action's behavior on* attrs. eval is never called; nothing is
 * recomputed (parity gate, G-C).
 *
 * The read sister of field.ts: where field.ts maps a write FieldViewModel's
 * design onto the form envelope, this maps a read column/cell design onto the
 * list envelope. The cell DISPATCH (text vs badge vs link …) is the structural
 * .svelte tree in List.svelte; these are only the leaf appearance/raw bits.
 */
import type { ColumnVM, CellVM, ActionVM, ResolvedNode, ListViewModel } from '@crudui/generator-core';
/** Join base class + a design node's class into one className ('' → undefined). */
export declare function nodeClass(base: string, node: ResolvedNode | undefined): string | undefined;
/** A design node's style trimmed ('' → undefined so the attr is omitted). */
export declare function nodeStyle(node: ResolvedNode | undefined): string | undefined;
/** Header cell (`<th>`) class: base + the column's resolved design class. */
export declare function headerClass(col: ColumnVM): string | undefined;
/** Header cell style. */
export declare function headerStyle(col: ColumnVM): string | undefined;
/** Body cell (`<td>`) class: base + format type + the cell's resolved design. */
export declare function cellClass(cell: CellVM): string | undefined;
/** Body cell style. */
export declare function cellStyle(cell: CellVM): string | undefined;
/** Sortable header marker text ('' for a non-sortable column → omit the span). */
export declare function sortMarker(col: ColumnVM): string;
/**
 * The active sort direction for a column ('asc'/'desc'), or undefined. A column
 * matches the declared `sort` by its `field` or its `key` — the sorted column
 * carries `data-sort-dir` so the declared sort is visible (read-only; the server
 * applies the real ORDER BY, SPEC §9.1).
 */
export declare function sortDir(vm: ListViewModel, col: ColumnVM): 'asc' | 'desc' | undefined;
/**
 * Serialize an action's behavior on* attrs to a raw attr string (one of the
 * sanctioned raw boundaries — opaque host scripts, preserved verbatim). Returns
 * '' when the action carries no behavior. Each behavior key is a DOM event name
 * (e.g. `click`); its value is the opaque script body kept verbatim by the core.
 */
export declare function actionBehaviorAttrs(action: ActionVM): string;
/**
 * Serialize one action to its raw `<a>`/`<button>` html (root-raw — behavior on*
 * attrs are coerced/dropped by svelte/server's dynamic spread, so the whole
 * action chrome is one raw boundary). A `link` format action becomes an `<a>`
 * (href from the action's format, here the un-interpolated template — actions are
 * row-agnostic in the toolbar); otherwise a `<button>` carrying the behavior.
 */
export declare function actionHtml(action: ActionVM): string;
/** Whether the list has any toolbar actions. */
export declare function hasActions(actions: ActionVM[]): boolean;
//# sourceMappingURL=list.d.ts.map