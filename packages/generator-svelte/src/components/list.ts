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

import type {
  ColumnVM,
  CellVM,
  ActionVM,
  ResolvedNode,
  ListViewModel,
} from '@form-spec/generator-core';

/** Join base class + a design node's class into one className ('' → undefined). */
export function nodeClass(base: string, node: ResolvedNode | undefined): string | undefined {
  const merged = [base, node?.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
  return merged || undefined;
}

/** A design node's style trimmed ('' → undefined so the attr is omitted). */
export function nodeStyle(node: ResolvedNode | undefined): string | undefined {
  const s = node?.style?.trim();
  return s || undefined;
}

/** Header cell (`<th>`) class: base + the column's resolved design class. */
export function headerClass(col: ColumnVM): string | undefined {
  return nodeClass('list-th', col.design.main);
}

/** Header cell style. */
export function headerStyle(col: ColumnVM): string | undefined {
  return nodeStyle(col.design.main);
}

/** Body cell (`<td>`) class: base + format type + the cell's resolved design. */
export function cellClass(cell: CellVM): string | undefined {
  const base = `list-td list-td-${cell.format.type}`;
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

/**
 * The active sort direction for a column ('asc'/'desc'), or undefined. A column
 * matches the declared `sort` by its `field` or its `key` — the sorted column
 * carries `data-sort-dir` so the declared sort is visible (read-only; the server
 * applies the real ORDER BY, SPEC §9.1).
 */
export function sortDir(vm: ListViewModel, col: ColumnVM): 'asc' | 'desc' | undefined {
  const s = vm.sort;
  if (!s) return undefined;
  if (s.field === col.field || s.field === col.key) return s.dir;
  return undefined;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize an action's behavior on* attrs to a raw attr string (one of the
 * sanctioned raw boundaries — opaque host scripts, preserved verbatim). Returns
 * '' when the action carries no behavior. Each behavior key is a DOM event name
 * (e.g. `click`); its value is the opaque script body kept verbatim by the core.
 */
export function actionBehaviorAttrs(action: ActionVM): string {
  if (!action.behavior) return '';
  let out = '';
  for (const [ev, script] of Object.entries(action.behavior)) {
    out += ` on${escAttr(ev)}="${escAttr(script)}"`;
  }
  return out;
}

/**
 * Serialize one action to its raw `<a>`/`<button>` html (root-raw — behavior on*
 * attrs are coerced/dropped by svelte/server's dynamic spread, so the whole
 * action chrome is one raw boundary). A `link` format action becomes an `<a>`
 * (href from the action's format, here the un-interpolated template — actions are
 * row-agnostic in the toolbar); otherwise a `<button>` carrying the behavior.
 */
export function actionHtml(action: ActionVM): string {
  const behavior = actionBehaviorAttrs(action);
  const label = escText(action.label);
  const cls = action.design?.main.class ? ` class="${escAttr(action.design.main.class)}"` : '';
  const style = action.design?.main.style ? ` style="${escAttr(action.design.main.style)}"` : '';
  if (action.format?.type === 'link') {
    const href = typeof action.format.options.href === 'string' ? action.format.options.href : '#';
    const target =
      typeof action.format.options.target === 'string'
        ? ` target="${escAttr(action.format.options.target)}"`
        : '';
    return `<a href="${escAttr(href)}"${target}${cls}${style}${behavior}>${label}</a>`;
  }
  return `<button type="button"${cls}${style}${behavior}>${label}</button>`;
}

/** Whether the list has any toolbar actions. */
export function hasActions(actions: ActionVM[]): boolean {
  return actions.length > 0;
}
