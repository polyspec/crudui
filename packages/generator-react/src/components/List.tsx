/**
 * CRUDUI React list component — `<List>` renders a composed `ListViewModel`.
 *
 * The read sister of `<Form>`: where Form maps core `NodeVM[]`
 * (compose + design eval + i18n) to an input field tree, List maps a core
 * `ListViewModel` (the same engine, columns + cells) to a read TABLE (default)
 * or CARD layout. It is a pure presentational tree: no evaluation, no string
 * concatenation. The ONLY raw passthrough sites are the sanctioned html cell
 * (inside Cell) and an action's opaque behavior `on*` script — the same opaque
 * category as the form's behavior slot (never routed through the expr engine).
 *
 * The emitted markup is the SHARED 3-framework list contract (React/Vue/Svelte
 * emit the SAME normalized HTML — tests/fixtures/list-render): a `.crudui-list`
 * envelope; a `.crudui-list__actions` toolbar; a `.crudui-list__table` (thead `.crudui-list__heading` →
 * `.crudui-list__heading-label` + `.crudui-list__sort`; tbody `.crudui-list__cell .crudui-list__cell-TYPE`) or a
 * `.crudui-list__cards` grid of `.crudui-list__card` articles; an empty `.crudui-list__empty`; a
 * `<nav class="crudui-list__pagination">` carrying the declared + injected meta. eval is
 * never called; there is NO input widget anywhere (read-only).
 */

import * as React from 'react';
import type {
  ListViewModel,
  ColumnVM,
  ActionVM,
  ListRowVM,
} from '@crudui/generator-core';
import { Cell } from './Cell';
import { resolvedStyleProps, styleObject } from './attrs';
import { escAttr, escText } from './raw';

/** Merge a base class with a resolved design class ('' dropped) → className/undefined. */
function nodeClass(base: string, cls: string): string | undefined {
  const merged = [base, cls].filter((s) => s && s.trim()).join(' ').trim();
  return merged || undefined;
}

/** Resolved node style → a React style object (undefined when empty). */
function nodeStyle(style: string): React.CSSProperties | undefined {
  return styleObject(style);
}

// ---------------------------------------------------------------------------
// actions (toolbar) — behavior is an opaque on* passthrough (raw boundary).
// ---------------------------------------------------------------------------

/** An action's behavior map → ` on<ev>="script"` raw attr string (verbatim). */
function behaviorAttrs(behavior: Record<string, string> | undefined): string {
  if (!behavior) return '';
  let out = '';
  for (const [ev, script] of Object.entries(behavior)) {
    out += ` on${escAttr(ev)}="${escAttr(script)}"`;
  }
  return out;
}

/**
 * One action's RAW html (the `<span class="crudui-list__action">` host is JSX; its inner
 * `<a>`/`<button>` is serialized verbatim so the opaque behavior `on*` bytes — and
 * React-dropped string event attrs — survive). A link-format action → `<a>`;
 * otherwise a `<button>`. Mirrors Svelte list.ts `actionHtml`.
 */
function actionHtml(action: ActionVM): string {
  const behavior = behaviorAttrs(action.behavior);
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

function Toolbar({ actions }: { actions: ActionVM[] }): React.ReactElement | null {
  if (!actions.length) return null;
  return (
    <div className="crudui-list__actions">
      {actions.map((a) => (
        <span
          key={a.key}
          className="crudui-list__action"
          data-action={a.key}
          dangerouslySetInnerHTML={{ __html: actionHtml(a) }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// table head / body
// ---------------------------------------------------------------------------

/** The active sort direction for a column ('asc'/'desc'), or undefined. */
function sortDir(vm: ListViewModel, col: ColumnVM): 'asc' | 'desc' | undefined {
  const s = vm.sort;
  if (!s) return undefined;
  if (s.field === col.field || s.field === col.key) return s.dir;
  return undefined;
}

function HeaderCell({
  col,
  vm,
}: {
  col: ColumnVM;
  vm: ListViewModel;
}): React.ReactElement {
  const className = nodeClass('crudui-list__heading', col.design.main.class);
  const style = nodeStyle(col.design.main.style);
  const dir = sortDir(vm, col);
  return (
    <th
      {...(className ? { className } : {})}
      {...resolvedStyleProps(style)}
      {...(col.field ? { 'data-field': col.field } : {})}
      {...(col.sortable ? { 'data-sortable': 'true' } : {})}
      {...(dir ? { 'data-sort-dir': dir } : {})}
    >
      <span className="crudui-list__heading-label">{col.label}</span>
      {col.sortable ? <span className="crudui-list__sort">↕</span> : null}
    </th>
  );
}

function BodyRow({ row }: { row: ListRowVM }): React.ReactElement {
  return (
    <tr>
      {row.cells.map((cell, i) => (
        <Cell key={i} cell={cell} />
      ))}
    </tr>
  );
}

function TableLayout({ vm }: { vm: ListViewModel }): React.ReactElement {
  return (
    <table className="crudui-list__table">
      <thead>
        <tr>
          {vm.columns.map((col) => (
            <HeaderCell key={col.key} col={col} vm={vm} />
          ))}
        </tr>
      </thead>
      <tbody>
        {vm.rows.map((row, i) => (
          <BodyRow key={i} row={row} />
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// card layout (alternative to table) — one article per row, label:value pairs.
// ---------------------------------------------------------------------------

function Card({
  row,
  columns,
}: {
  row: ListRowVM;
  columns: ColumnVM[];
}): React.ReactElement {
  return (
    <article className="crudui-list__card">
      {row.cells.map((cell, i) => {
        const cls = nodeClass(`crudui-list__cell crudui-value crudui-value--${cell.format.type}`, cell.design.main.class);
        return (
          <div className={cls} key={i}>
            <span className="crudui-list__card-label">{columns[i]?.label ?? ''}</span>
            <Cell cell={cell} as="span" base="crudui-list__card-value" />
          </div>
        );
      })}
    </article>
  );
}

function CardLayout({ vm }: { vm: ListViewModel }): React.ReactElement {
  return (
    <div className="crudui-list__cards">
      {vm.rows.map((row, i) => (
        <Card key={i} row={row} columns={vm.columns} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// pagination (declared + injected meta; NO derivation, no DB)
// ---------------------------------------------------------------------------

function Pagination({ vm }: { vm: ListViewModel }): React.ReactElement | null {
  const p = vm.pagination;
  if (!p.enabled) return null;
  return (
    <nav
      className="crudui-list__pagination"
      {...(p.mode ? { 'data-mode': p.mode } : {})}
      {...(p.perPage !== undefined ? { 'data-per-page': String(p.perPage) } : {})}
      {...(p.page !== undefined ? { 'data-page': String(p.page) } : {})}
      {...(p.total !== undefined ? { 'data-total': String(p.total) } : {})}
    />
  );
}

// ---------------------------------------------------------------------------
// the list envelope
// ---------------------------------------------------------------------------

/** Props for the CRUDUI list: the core-built view model + a layout selector. */
export interface ListProps {
  /** Evaluated list model rendered by the component. */
  vm: ListViewModel;
  /** 'table' (default) or 'card'. */
  layout?: 'table' | 'card';
}

/** Render the `.crudui-list` envelope around toolbar + table/card body + pagination. */
export function List({ vm, layout = 'table' }: ListProps): React.ReactElement {
  const className = nodeClass('crudui-list', vm.design.wrapper.class);
  const style = nodeStyle(vm.design.wrapper.style);
  const isEmpty = vm.rows.length === 0;
  return (
    <div {...(className ? { className } : {})} {...resolvedStyleProps(style)}>
      <Toolbar actions={vm.actions} />
      {isEmpty ? (
        <div className="crudui-list__empty">{vm.empty}</div>
      ) : layout === 'card' ? (
        <CardLayout vm={vm} />
      ) : (
        <TableLayout vm={vm} />
      )}
      <Pagination vm={vm} />
    </div>
  );
}
