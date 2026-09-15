/**
 * CRUDUI Vue list renderer — `List` builds a `ListViewModel` as real `h()` vnodes.
 *
 * The read sister of Form (SPEC §9). It consumes the core's already-built
 * `ListViewModel` (compose + design eval + condition maps + i18n + cell render,
 * all done ONCE in @crudui/generator-core buildList) and assembles a genuine
 * Vue 3 vnode tree — a `<table>` (default) or a `.crudui-list__cards` card grid. It
 * RECOMPUTES NOTHING: every header label, sortable flag, cell display payload,
 * resolved class/style and action script is already evaluated by the core. eval
 * is never called; no DB access; rows are the injected display rows.
 *
 * The emitted markup is the SHARED 3-framework list contract (React/Vue/Svelte
 * emit the SAME normalized HTML — tests/fixtures/list-render): a `.crudui-list`
 * envelope; a `.crudui-list__actions` toolbar; a `.crudui-list__table` (thead `.crudui-list__heading` →
 * `.crudui-list__heading-label` + `.crudui-list__sort`; tbody `.crudui-list__cell .crudui-list__cell-TYPE`) or a
 * `.crudui-list__cards` grid of `.crudui-list__card` articles; an empty `.crudui-list__empty`; a
 * `<nav class="crudui-list__pagination">`. The ONLY raw `innerHTML` paths are the two
 * sanctioned verbatim boundaries — a `html`-format cell (the host's own inner
 * html, no wrapper) and an action's opaque `behavior` chrome. Read-only: NO
 * `<input>`/`<select>`/`<form>` is emitted.
 */

import { h, type VNode } from 'vue';
import type {
  ListViewModel,
  ColumnVM,
  CellVM,
  ActionVM,
  CellDisplay,
} from '@crudui/generator-core';

// ---------------------------------------------------------------------------
// class/style helpers (resolved design → vnode props)
// ---------------------------------------------------------------------------

/** Merge a base class with a resolved design class ('' dropped). */
function mergeClass(base: string, extra: string): string {
  return [base, extra].filter((s) => s && s.trim()).join(' ').trim();
}

/** Style prop ('' → omitted). Vue accepts a STRING style verbatim. */
function styleProp(style: string): Record<string, string> {
  const s = style?.trim();
  return s ? { style: s } : {};
}

// ---------------------------------------------------------------------------
// cell display → vnode (the read symmetric of Widget)
// ---------------------------------------------------------------------------

/**
 * Render one resolved `CellDisplay` to a vnode (or a plain string child). A
 * string display (text/date/number/choice-label) is emitted as escaped text; a
 * structured display becomes its element (badge/link/image/bool). The `html`
 * display is handled by the host (cellVNode/card value) directly via innerHTML so
 * NO wrapper element is added.
 */
export function cellDisplayVNode(display: CellDisplay): VNode | string {
  if (typeof display === 'string') return display;
  switch (display.kind) {
    case 'badge':
      return h(
        'span',
        { class: 'crudui-badge', ...(display.variant ? { 'data-crudui-variant': display.variant } : {}) },
        display.label
      );

    case 'link':
      return h(
        'a',
        {
          href: display.href,
          ...(display.target ? { target: display.target } : {}),
        },
        display.text
      );

    case 'image':
      return h('img', {
        src: display.src,
        alt: display.alt,
        ...(display.width !== undefined ? { width: display.width } : {}),
        ...(display.height !== undefined ? { height: display.height } : {}),
      });

    case 'bool':
      if (display.as === 'check') {
        return h('span', { class: 'crudui-bool crudui-bool--check', 'data-crudui-state': String(display.value), 'aria-label': display.label }, display.value ? '✔' : '✘');
      }
      if (display.as === 'icon') {
        return h('span', {
          class: 'crudui-bool crudui-bool--icon',
          'data-crudui-state': String(display.value),
          'aria-label': display.label,
        });
      }
      return h('span', { class: 'crudui-bool crudui-bool--text', 'data-crudui-state': String(display.value) }, display.label);

    case 'html':
      // Handled by the host (innerHTML) — never reached as a child vnode.
      return '';

    default:
      return '';
  }
}

/**
 * Host props (class + per-cell design). Cell visibility is the COLUMN's job (a
 * `design.show:false` column is dropped whole by buildList — header + every cell,
 * G1); a cell never re-hides itself via `display:none` (shared 3-framework
 * contract). Per-cell conditional appearance is class/style, not show.
 */
function cellHostProps(base: string, cell: CellVM): Record<string, unknown> {
  return { class: mergeClass(base, cell.design.main.class), ...styleProp(cell.design.main.style) };
}

/** One `<td>` for a cell: `crudui-list__cell crudui-value crudui-value--TYPE` + resolved design + display. */
function cellVNode(cell: CellVM): VNode {
  const base = `crudui-list__cell crudui-value crudui-value--${cell.format.type}`;
  const props = cellHostProps(base, cell);
  const d = cell.display;
  if (typeof d !== 'string' && d.kind === 'html') {
    // The sanctioned raw boundary: the host carries verbatim html (no wrapper).
    return h('td', { ...props, innerHTML: d.html });
  }
  return h('td', props, [cellDisplayVNode(d)]);
}

// ---------------------------------------------------------------------------
// table layout (default)
// ---------------------------------------------------------------------------

/** The active sort direction for a column ('asc'/'desc'), or undefined. */
function sortDir(vm: ListViewModel, col: ColumnVM): 'asc' | 'desc' | undefined {
  const s = vm.sort;
  if (!s) return undefined;
  if (s.field === col.field || s.field === col.key) return s.dir;
  return undefined;
}

/** One header `<th>`: `.crudui-list__heading-label` + a `.crudui-list__sort` marker (sortable). */
function headerVNode(col: ColumnVM, vm: ListViewModel): VNode {
  const dir = sortDir(vm, col);
  const children: VNode[] = [h('span', { class: 'crudui-list__heading-label' }, col.label)];
  if (col.sortable) children.push(h('span', { class: 'crudui-list__sort' }, '↕'));
  return h(
    'th',
    {
      class: mergeClass('crudui-list__heading', col.design.main.class),
      ...(col.field ? { 'data-field': col.field } : {}),
      ...(col.sortable ? { 'data-sortable': 'true' } : {}),
      ...(dir ? { 'data-sort-dir': dir } : {}),
      ...styleProp(col.design.main.style),
    },
    children
  );
}

/** The `<thead>` row of column headers. */
function theadVNode(vm: ListViewModel): VNode {
  return h('thead', {}, [h('tr', {}, vm.columns.map((col) => headerVNode(col, vm)))]);
}

/** The `<tbody>` of rows. */
function tbodyVNode(vm: ListViewModel): VNode {
  return h(
    'tbody',
    {},
    vm.rows.map((row) => h('tr', {}, row.cells.map((cell) => cellVNode(cell))))
  );
}

/** Build the default `<table>` body for a list view model. */
function tableVNode(vm: ListViewModel): VNode {
  return h('table', { class: 'crudui-list__table' }, [theadVNode(vm), tbodyVNode(vm)]);
}

// ---------------------------------------------------------------------------
// card layout (opt-in via mode: 'cards')
// ---------------------------------------------------------------------------

/** The value vnode of one card cell — html cells inject verbatim via innerHTML. */
function cardValueVNode(cell: CellVM): VNode {
  const d = cell.display;
  if (typeof d !== 'string' && d.kind === 'html') {
    return h('span', { class: 'crudui-list__card-value', innerHTML: d.html });
  }
  return h('span', { class: 'crudui-list__card-value' }, [cellDisplayVNode(d)]);
}

/** One card: a labelled field row per visible column. */
function cardVNode(cells: CellVM[], columns: ColumnVM[]): VNode {
  return h(
    'article',
    { class: 'crudui-list__card' },
    columns.map((col, i) => {
      const cell = cells[i];
      const cls = cell ? mergeClass(`crudui-list__cell crudui-value crudui-value--${cell.format.type}`, cell.design.main.class) : 'crudui-list__cell';
      return h('div', { class: cls }, [
        h('span', { class: 'crudui-list__card-label' }, col.label),
        cell ? cardValueVNode(cell) : h('span', { class: 'crudui-list__card-value' }),
      ]);
    })
  );
}

/** Build the card-grid body for a list view model. */
function cardsVNode(vm: ListViewModel): VNode {
  return h('div', { class: 'crudui-list__cards' }, vm.rows.map((row) => cardVNode(row.cells, vm.columns)));
}

// ---------------------------------------------------------------------------
// actions toolbar + pagination chrome
// ---------------------------------------------------------------------------

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
 * One action's RAW html (the `<span class="crudui-list__action">` host is a vnode; its
 * inner `<a>`/`<button>` is serialized verbatim so the opaque behavior `on*`
 * bytes survive). Mirrors Svelte list.ts `actionHtml`.
 */
function actionHtml(action: ActionVM): string {
  const behavior = behaviorAttrs(action.behavior);
  const label = escText(action.label);
  const cls = action.design?.main.class ? ` class="${escAttr(action.design.main.class)}"` : '';
  const style = action.design?.main.style ? ` style="${escAttr(action.design.main.style)}"` : '';
  if (action.format?.type === 'link') {
    const href =
      typeof action.format.options.href === 'string' ? action.format.options.href : '#';
    const target =
      typeof action.format.options.target === 'string'
        ? ` target="${escAttr(action.format.options.target)}"`
        : '';
    return `<a href="${escAttr(href)}"${target}${cls}${style}${behavior}>${label}</a>`;
  }
  return `<button type="button"${cls}${style}${behavior}>${label}</button>`;
}

/** The actions toolbar (null when there are no actions). */
function toolbarVNode(vm: ListViewModel): VNode | null {
  if (vm.actions.length === 0) return null;
  return h(
    'div',
    { class: 'crudui-list__actions' },
    vm.actions.map((a) =>
      h('span', { class: 'crudui-list__action', 'data-action': a.key, innerHTML: actionHtml(a) })
    )
  );
}

/** Pagination chrome (null when paging is off) — declaration + injected meta. */
function paginationVNode(vm: ListViewModel): VNode | null {
  const p = vm.pagination;
  if (!p.enabled) return null;
  const props: Record<string, unknown> = { class: 'crudui-list__pagination' };
  if (p.mode !== undefined) props['data-mode'] = p.mode;
  if (p.perPage !== undefined) props['data-per-page'] = String(p.perPage);
  if (p.page !== undefined) props['data-page'] = String(p.page);
  if (p.total !== undefined) props['data-total'] = String(p.total);
  return h('nav', props);
}

// ---------------------------------------------------------------------------
// the list envelope
// ---------------------------------------------------------------------------

/** Render mode: a default `<table>` or a card grid. */
export type ListLayout = 'table' | 'card';

/**
 * Build the `.crudui-list` envelope vnode around a `ListViewModel`: the actions
 * toolbar, the table/card body (or the `.crudui-list__empty` message), and the
 * pagination chrome. Pure presentational vnode tree — no evaluation, no DB,
 * read-only.
 */
export function List(vm: ListViewModel, layout: ListLayout = 'table'): VNode {
  const isEmpty = vm.rows.length === 0;
  const body = isEmpty
    ? h('div', { class: 'crudui-list__empty' }, vm.empty)
    : layout === 'card'
    ? cardsVNode(vm)
    : tableVNode(vm);
  const children = [toolbarVNode(vm), body, paginationVNode(vm)].filter(
    (c): c is VNode => c !== null
  );
  return h(
    'div',
    {
      class: mergeClass('crudui-list', vm.design.wrapper.class),
      ...styleProp(vm.design.wrapper.style),
    },
    children
  );
}
