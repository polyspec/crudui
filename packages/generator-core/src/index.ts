/**
 * CRUDUI evaluation core (framework-agnostic) — compose + evaluate, markup 0.
 *
 * The single source of truth shared by every framework adapter (React/Vue/
 * Svelte). It runs the four mandated stages WITHOUT emitting markup:
 *   (1) CRUDUI spec → (2) CRUDUI compose (validator-js composeProperties: expand
 *   $ref/$patch into a single composition-free spec; an unresolved $ref is a
 *   ComposeLoadError, never a render) → (3) resolve `design` slots + condition
 *   maps via the shared expr engine + resolve i18n CONTENT via t() → (4) build a
 *   `FieldViewModel[]` tree (group/multiple/lang/leaf, explicit row identity,
 *   per-widget evaluated attributes/items/scripts).
 *
 * The adapter takes the returned `FieldViewModel[]` and assembles the element
 * tree (JSX / h() / .svelte) — it recomputes nothing. compose + expr are reused
 * from validator-js; the evaluation lives here, once. eval is never called.
 */

import {
  composeProperties,
  MemoryLoader,
  type FileLoader,
} from '@form-spec/validator';
import { makeTranslate, type Language } from './content';
import {
  buildField,
  type BuildState,
  type FieldViewModel,
  type UnsupportedMode,
} from './viewmodel';

export type { FieldViewModel, UnsupportedMode, RowVM, LangChildVM, UnsupportedVM, BuildState } from './viewmodel';
export type { WidgetModel, WidgetCtx, Attrs, Affix, OptionModel } from './widget';
export { WIDGET_COUNT, WIDGET_KINDS, WIDGET_LAYOUTS, WIDGET_CANONICAL, hasWidget } from './widget';
export { buildField } from './viewmodel';

// Shared framework-agnostic surfaces (the single source every adapter consumes).
export { ComposeLoadError } from '@form-spec/validator';
export { UnsupportedFieldTypeError } from './errors';
export { resolveDesign } from './design';
export type { ResolvedDesign, ResolvedNode } from './design';
export { evalShow, evalAppearance, makeContext } from './expr';
export type { Evaluated } from './expr';
export { makeTranslate } from './content';
export type { Language, LocalizedText, Translate } from './content';

// list-spec (read sister) — buildList + the read cell renderer (additive; the
// form/write surfaces above are untouched). schema §9.
export { buildList } from './list';
export type {
  ListViewModel,
  ColumnVM,
  CellVM,
  RowVM as ListRowVM,
  PaginationVM,
  SortVM,
  ActionVM,
  BuildListOptions,
} from './list';
export { renderCell, normalizeFormat } from './cell';
export type {
  CellFormatModel,
  CellDisplay,
  CellRenderCtx,
  BadgeDisplay,
  LinkDisplay,
  ImageDisplay,
  BoolDisplay,
  HtmlDisplay,
} from './cell';

/** Options for building a CRUDUI form view model. */
export interface BuildFormOptions {
  /** Form data (the expr engine's formData + value source). */
  data?: Record<string, unknown>;
  /** Active content language (default 'ko'). */
  language?: Language;
  /** Name/id prefix. */
  keyPrefix?: string;
  /** $ref file set for composition (virtual in-memory loader). */
  files?: Record<string, Record<string, unknown>>;
  /** A custom loader (overrides `files`). */
  loader?: FileLoader;
  /** Basepath for relative $ref. */
  basepath?: string;
  /** Unsupported field-type handling (default 'throw'). */
  unsupported?: UnsupportedMode;
}

/**
 * Compose the root spec and build the top-level `FieldViewModel[]` (the field
 * list, no markup). The root spec must be a group with `properties`; composition
 * is expanded first. Throws `ComposeLoadError` on an unresolved `$ref`.
 */
export function buildForm(
  rootSpec: Record<string, unknown>,
  options: BuildFormOptions = {}
): FieldViewModel[] {
  const data = options.data ?? {};
  const t = makeTranslate(options.language ?? 'ko');
  const loader = options.loader ?? new MemoryLoader(options.files ?? {});
  const opts = options.basepath ? { basepath: options.basepath } : {};

  // Stage 2: compose the root properties (recurses into nested $ref/$patch).
  const rawProps = (rootSpec.properties as Record<string, unknown>) ?? {};
  const props = composeProperties(rawProps, loader, opts);

  const state: BuildState = {
    data,
    keyPrefix: options.keyPrefix,
    t,
    unsupported: options.unsupported ?? 'throw',
  };

  // Stages 3–4: evaluate each composed top-level field into a view model.
  const out: FieldViewModel[] = [];
  for (const [name, fieldSpec] of Object.entries(props)) {
    if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
      void name;
      out.push(buildField(fieldSpec as Record<string, unknown>, name, state));
    }
  }
  return out;
}
