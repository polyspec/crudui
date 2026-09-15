/** Evaluate list declarations and supplied records for framework renderers. */

import {
  FormInputError,
  composeProperties,
  MemoryLoader,
  type FileLoader,
} from '@crudui/validator';
import { makeTranslate, type Language, type LocalizedText } from './content';
import { resolveDesign, type ResolvedDesign } from './design';
import { evalShow, makeContext } from './expr';
import { parsePathString, getValueByPath } from './util';
import {
  normalizeFormat,
  renderCell,
  type CellFormatModel,
  type CellDisplay,
  type CellRenderCtx,
} from './cell';

// ---------------------------------------------------------------------------
// view model shapes
// ---------------------------------------------------------------------------

/** A resolved list column header (markup-free). */
export interface ColumnVM {
  /** Stable column key (the column's name in the columns map). */
  key: string;
  /** Value path read from each row (the column `field`, '' when absent). */
  field: string;
  /** Translated header label (defaults to the column key). */
  label: string;
  /** Normalized cell format applied to every cell in this column. */
  format: CellFormatModel;
  /** Sort-allowed declaration (read-only; real sort is the server's job). */
  sortable: boolean;
  /** Resolved column-level design (evaluated against the build context). */
  design: ResolvedDesign;
}

/** A resolved cell within one row. */
export interface CellVM {
  /** The column's normalized format (shared shape with ColumnVM.format). */
  format: CellFormatModel;
  /** Raw value read from the injected row by the column `field` path; `null` when the row has none. */
  value: unknown;
  /** Display payload from the cell renderer (string or structured). */
  display: CellDisplay;
  /** Cell design resolved against THIS row (condition maps may read the row). */
  design: ResolvedDesign;
}

/** A resolved row: one cell per visible column. */
export interface RowVM {
  /** Cells in visible column order. */
  cells: CellVM[];
}

/** Resolved pagination declaration with the caller's current page and total. */
export interface PaginationVM {
  /** false when paging is off. */
  enabled: boolean;
  /** Declared number of rows per page. */
  perPage?: number;
  /** Declared pagination mode. */
  mode?: string;
  /** Current page from the `page` option, never derived from the rows. */
  page?: number;
  /** Total record count from the `total` option. */
  total?: number;
}

/** Resolved sort declaration. */
export interface SortVM {
  /** Data field to sort. */
  field: string;
  /** Sort direction. */
  dir: 'asc' | 'desc';
}

/** A resolved list action (toolbar/row). */
export interface ActionVM {
  /** Action key (the action's name in the actions map). */
  key: string;
  /** Translated action label (defaults to the action key). */
  label: string;
  /** Normalized action format (usually link), when present. */
  format?: CellFormatModel;
  /** Opaque behavior script entries (preserved verbatim), when present. */
  behavior?: Record<string, string>;
  /** Resolved action design, when present. */
  design?: ResolvedDesign;
}

/** The fully-evaluated, markup-free description of a list (SPEC §9.3). */
export interface ListViewModel {
  /** Visible columns (declaration order; `design.show:false` columns dropped). */
  columns: ColumnVM[];
  /** Resolved rows (one cell per visible column). */
  rows: RowVM[];
  /** Pagination declaration with the current page and total. */
  pagination: PaginationVM;
  /** Current sort declaration, or undefined when none. */
  sort?: SortVM;
  /** Resolved list actions (declaration order). */
  actions: ActionVM[];
  /** Translated empty-list message. */
  empty: string;
  /** Resolved list-container design. */
  design: ResolvedDesign;
}

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------

/** Options for building a list view model. */
export interface BuildListOptions {
  /** Active content language (default 'ko'). */
  language?: Language;
  /**
   * List-level form data for column-visibility expressions (e.g. `design.show:
   * '.admin'` on a column). NOT the rows — rows are the separate argument.
   */
  data?: Record<string, unknown>;
  /** Current page supplied by the caller: absent, null or an integer from 1 to `Number.MAX_SAFE_INTEGER`. */
  page?: number | null;
  /** Total record count supplied by the caller: absent, null or an integer from 0 to `Number.MAX_SAFE_INTEGER`. */
  total?: number | null;
  /** $ref file set for composition (virtual in-memory loader). */
  files?: Record<string, Record<string, unknown>>;
  /** A custom loader (overrides `files`). */
  loader?: FileLoader;
  /** Basepath for relative $ref. */
  basepath?: string;
}

// ---------------------------------------------------------------------------
// resolution helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function resolveSortable(
  sortable: unknown,
  ctx: ReturnType<typeof makeContext>
): boolean {
  if (sortable === undefined || sortable === null) return false;
  if (typeof sortable === 'boolean') return sortable;
  // An Expression → evaluated as a condition against the list context.
  return evalShow(sortable, ctx);
}

/** A page or total option: absent or null, or a safe integer of at least `min`. */
function countOption(value: unknown, min: number): value is number | null | undefined {
  return value === undefined || value === null || (Number.isSafeInteger(value) && (value as number) >= min);
}

function resolvePagination(pagination: unknown, page: number | null | undefined, total: number | null | undefined): PaginationVM {
  let base: PaginationVM;
  if (pagination === false) {
    base = { enabled: false };
  } else if (pagination === undefined || pagination === null || pagination === true) {
    base = { enabled: pagination === true };
  } else if (isPlainObject(pagination)) {
    base = {
      enabled: true,
      perPage: typeof pagination.per_page === 'number' ? pagination.per_page : undefined,
      mode: typeof pagination.mode === 'string' ? pagination.mode : undefined,
    };
  } else {
    base = { enabled: false };
  }
  // `+ 0` writes negative zero as 0, as every runtime does.
  if (page !== undefined && page !== null) base.page = page + 0;
  if (total !== undefined && total !== null) base.total = total + 0;
  return base;
}

function resolveSort(sort: unknown): SortVM | undefined {
  if (!isPlainObject(sort)) return undefined;
  const field = typeof sort.field === 'string' ? sort.field : '';
  if (!field) return undefined;
  const dir = sort.dir === 'desc' ? 'desc' : 'asc';
  return { field, dir };
}

function resolveActions(
  actions: unknown,
  t: ReturnType<typeof makeTranslate>
): ActionVM[] {
  if (!isPlainObject(actions)) return [];
  const out: ActionVM[] = [];
  for (const [key, raw] of Object.entries(actions)) {
    if (key === '$ref' || key === '$patch') continue;
    if (typeof raw === 'string') {
      // ListAction = a bare behavior script (BehaviorAction form).
      out.push({ key, label: key, behavior: { [key]: raw } });
      continue;
    }
    if (!isPlainObject(raw)) continue;
    const action: ActionVM = {
      key,
      label: raw.label !== undefined ? t(raw.label as LocalizedText) : key,
    };
    if (raw.format !== undefined) action.format = normalizeFormat(raw.format);
    if (isPlainObject(raw.behavior)) {
      const beh: Record<string, string> = {};
      for (const [ev, scr] of Object.entries(raw.behavior)) {
        if (typeof scr === 'string') beh[ev] = scr;
        else if (isPlainObject(scr) && typeof scr.script === 'string') beh[ev] = scr.script;
      }
      if (Object.keys(beh).length > 0) action.behavior = beh;
    }
    out.push(action);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the builder
// ---------------------------------------------------------------------------

/**
 * The list layout option: absent or null selects `table`, and any value other than `table` or
 * `card` fails. Renderers check it after building the list model, so input errors keep the order
 * every runtime uses.
 */
export function listLayout(layout: unknown): 'table' | 'card' {
  if (layout === undefined || layout === null) return 'table';
  if (layout === 'table' || layout === 'card') return layout;
  throw new FormInputError('List layout must be table or card');
}

/**
 * Compose a list spec and build its `ListViewModel`. `rows` are injected (no DB
 * access); each cell value is read from a row by the column `field` path. Invalid
 * input fails with the messages in the display format specification, and an
 * unresolved `$ref` throws `ComposeLoadError` (never a silent render).
 */
export function buildList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: BuildListOptions = {}
): ListViewModel {
  // List input, checked in the order every runtime uses (docs/spec/display-formats.md).
  if (!isPlainObject(listSpec)) throw new FormInputError('List specification must be an object');
  if (!Array.isArray(rows)) throw new FormInputError('List rows must be an array');
  if (rows.some((row) => !isPlainObject(row))) throw new FormInputError('List rows must be objects');
  if (options.data !== undefined && options.data !== null && !isPlainObject(options.data)) {
    throw new FormInputError('List context must be an object');
  }
  if (!countOption(options.page, 1)) throw new FormInputError('List page must be a positive integer');
  if (!countOption(options.total, 0)) throw new FormInputError('List total must be a nonnegative integer');
  const t = makeTranslate(options.language ?? 'ko');
  const loader = options.loader ?? new MemoryLoader(options.files ?? {});
  const composeOpts = options.basepath ? { basepath: options.basepath } : {};
  const listData = options.data ?? {};

  // Stage 2: compose the columns map (expands $ref/$patch at map + per-column).
  const rawColumns = isPlainObject(listSpec.columns) ? listSpec.columns : {};
  const columns = composeProperties(rawColumns, loader, composeOpts);

  // List-level context for column-visibility expressions (over listData).
  const listCtx = makeContext([], listData);

  // Stages 3–4: resolve every column header (drop columns hidden by design.show).
  const columnVMs: ColumnVM[] = [];
  for (const [key, raw] of Object.entries(columns)) {
    if (!isPlainObject(raw)) continue;
    const colCtx = makeContext([], listData);
    const colDesign = resolveDesign(raw.design, colCtx);
    if (!colDesign.show) continue; // condition-hidden column → omitted (G1).
    columnVMs.push({
      key,
      field: typeof raw.field === 'string' ? raw.field : '',
      label: raw.label !== undefined ? t(raw.label as LocalizedText) : key,
      format: normalizeFormat(raw.format),
      sortable: resolveSortable(raw.sortable, listCtx),
      design: colDesign,
    });
  }

  // Re-read the composed column specs by key (for per-cell design re-evaluation).
  const colSpecs = columnVMs.map((c) => columns[c.key] as Record<string, unknown>);

  // Rows: one cell per visible column, value read by the column field path.
  const rowVMs: RowVM[] = rows.map((row) => {
    const cells: CellVM[] = columnVMs.map((col, i) => {
      const value = col.field ? getValueByPath(row, stripLeadingDot(col.field)) : undefined;
      // Per-cell expr context: the row is the formData, the field path is current.
      const cellExpr = makeContext(
        col.field ? parsePathString(stripLeadingDot(col.field)) : [],
        row
      );
      const cellDesign = resolveDesign(colSpecs[i]?.design, cellExpr);
      const renderCtx: CellRenderCtx = { row, expr: cellExpr, t };
      return {
        format: col.format,
        // A model is JSON: a path absent from the row is `null`, and the member is always present.
        value: value === undefined ? null : value,
        display: renderCell(col.format, value, renderCtx),
        design: cellDesign,
      };
    });
    return { cells };
  });

  return {
    columns: columnVMs,
    rows: rowVMs,
    pagination: resolvePagination(listSpec.pagination, options.page, options.total),
    sort: resolveSort(listSpec.sort),
    actions: resolveActions(listSpec.actions, t),
    empty: listSpec.empty !== undefined ? t(listSpec.empty as LocalizedText) : '',
    design: resolveDesign(listSpec.design, listCtx),
  };
}

/** A column `field` is an Expression path; a leading `.` means root-relative. */
function stripLeadingDot(field: string): string {
  return field.startsWith('.') ? field.slice(1) : field;
}
