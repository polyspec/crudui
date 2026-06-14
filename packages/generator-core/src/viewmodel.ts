/**
 * CRUDUI field-tree builder (framework-agnostic core) — markup 0, evaluation only.
 *
 * This is the structural half of the former render.ts: it walks the composed
 * spec tree and produces a `FieldViewModel` tree — the same group/multiple/lang/
 * leaf branching, the same explicit row identity (G4), the same checkbox/switcher/
 * hidden envelope flags, the same evaluated `design` and resolved CONTENT — but it
 * emits NO markup. A React/Vue/Svelte adapter renders the element tree from this
 * view model; the evaluation lives here, once.
 *
 * Inherited verbatim from render.ts:
 *  - design slot evaluation per node (via resolveDesign over makeContext),
 *  - multiple row model: resolveMultiple + rowIdentities (explicit `#N` position
 *    index / object key / single placeholder; no magic token),
 *  - lang row model: resolveLang (false|true|{only,frame,title,group_class}),
 *  - the wrapper layer name / element id / data-uniqid derivation (util.ts),
 *  - the unsupported-type lane: throw (default) or marker (never silent).
 *
 * No legacy meta key is read; no markup string is built; eval is never called.
 */

import {
  elementId,
  getValueByPath,
  joinClass,
  positionSegment,
  styleString,
  toBracketNotationWithPrefix,
  valuePathSegments,
  wrapperLayerName,
} from './util';
import { resolveDesign, type ResolvedDesign } from './design';
import { makeContext } from './expr';
import { UnsupportedFieldTypeError } from './errors';
import type { Translate } from './content';
import { evalWidget, type WidgetCtx, type WidgetModel } from './widget';

/** Behavior when a field `type` has no registered widget. */
export type UnsupportedMode = 'throw' | 'marker';

/** Per-build state threaded through the recursive tree builder. */
export interface BuildState {
  /** The root form data (the expr engine's formData). */
  data: Record<string, unknown>;
  /** Optional name/id prefix. */
  keyPrefix?: string;
  /** Content translator (active language). */
  t: Translate;
  /** Unsupported-type handling (default 'throw' — never silent). */
  unsupported: UnsupportedMode;
}

/** Discriminator for the four field shapes. */
export type FieldShape = 'leaf' | 'group' | 'multiple-leaf' | 'multiple-group' | 'lang';

/** A repeated row's explicit identity (G4) plus its built body. */
export interface RowVM {
  /** data-uniqid value (serialization index or hidden server-PK key). */
  uniqid: string;
  /** input-group-wrapper class for this row (clone-element when index>0). */
  wrapperClass: string;
  /** Leaf widget for a multiple-leaf row, else undefined. */
  widget?: WidgetModel | UnsupportedVM;
  /** .form-group class for a multiple-group row, else undefined. */
  groupClass?: string;
  /** Child fields for a multiple-group row, else undefined. */
  children?: FieldViewModel[];
}

/** One language child of a lang field. */
export interface LangChildVM {
  code: string;
  widget: WidgetModel | UnsupportedVM;
}

/** A surfaced unsupported-type marker (only in 'marker' mode). */
export interface UnsupportedVM {
  unsupported: true;
  type: string;
}

/** The fully-evaluated, markup-free description of one field node. */
export interface FieldViewModel {
  /** Field shape (how the adapter dispatches). */
  shape: FieldShape;
  /** Resolved field type. */
  type: string;
  /** Field path (debug/key). */
  path: string;
  /** Wrapper `name` attribute (`{dotName}-layer`). */
  wrapperName: string;
  /** data-uniqid for the single wrapper (leaf/group/lang). */
  uniqid: string;
  /** Resolved design (show + per-node appearance). */
  design: ResolvedDesign;
  /** Translated label, or undefined (hidden omits it). */
  label?: string;
  /** True when the label must be omitted (hidden type). */
  omitLabel: boolean;
  /** Translated description, or undefined. */
  description?: string;
  /** Leaf widget model (leaf shape), or marker. */
  widget?: WidgetModel | UnsupportedVM;
  /** checkbox/switcher special envelope flag. */
  checkbox?: boolean;
  /** checkbox bracket name + caption (checkbox/switcher only). */
  checkboxName?: string;
  /** checkbox main class (valid-target + design.main). */
  checkboxClass?: string;
  /** Group children (group shape). */
  children?: FieldViewModel[];
  /** .form-group class + style (group shape). */
  groupClass?: string;
  groupStyle?: string;
  /** Repeated rows (multiple-leaf/multiple-group shape). */
  rows?: RowVM[];
  /** Row buttons settings (multiple shape). */
  multiple?: MultipleSettings;
  /** Lang container (lang shape). */
  lang?: {
    groupClass: string;
    title?: string;
    children: LangChildVM[];
  };
}

// ---------------------------------------------------------------------------
// multiple / lang settings (ported from render.ts)
// ---------------------------------------------------------------------------

export interface MultipleSettings {
  show: boolean;
  max?: number;
  copy?: boolean;
  sortable?: boolean;
}

function resolveMultiple(spec: Record<string, unknown>): MultipleSettings | null {
  const m = spec.multiple;
  if (m === undefined || m === false) return null;
  if (m === true) return { show: true };
  if (typeof m === 'object' && !Array.isArray(m)) {
    const o = m as Record<string, unknown>;
    return {
      show: true,
      max: typeof o.max === 'number' ? o.max : undefined,
      copy: o.copy === true,
      sortable: o.sortable === true,
    };
  }
  return null;
}

const DEFAULT_LANGS = ['ko', 'en', 'ja', 'zh'];

interface LangSettings {
  langs: string[];
  frame: boolean;
  title?: unknown;
  groupClass?: string;
}

function resolveLang(spec: Record<string, unknown>): LangSettings | null {
  const l = spec.lang;
  if (l === undefined || l === false) return null;
  if (l === true) return { langs: DEFAULT_LANGS, frame: true };
  if (typeof l === 'object' && !Array.isArray(l)) {
    const o = l as Record<string, unknown>;
    return {
      langs:
        Array.isArray(o.only) && o.only.length > 0 ? (o.only as string[]) : DEFAULT_LANGS,
      frame: o.frame !== false,
      title: o.title,
      groupClass: typeof o.group_class === 'string' ? o.group_class : undefined,
    };
  }
  return null;
}

interface RowIdentity {
  seg: string;
  uniqid: string;
}

function rowIdentities(value: unknown): RowIdentity[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((_, i) => ({ seg: positionSegment(i), uniqid: String(i) }));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) return keys.map((k) => ({ seg: k, uniqid: k }));
  }
  // Empty data → a single placeholder row at position 0.
  return [{ seg: positionSegment(0), uniqid: '0' }];
}

function inputGroupWrapperClass(design: ResolvedDesign, rowIndex = 0): string {
  return joinClass(
    'input-group-wrapper',
    rowIndex > 0 ? 'clone-element' : '',
    design.wrapper.class
  );
}

// ---------------------------------------------------------------------------
// leaf widget evaluation (with the unsupported lane)
// ---------------------------------------------------------------------------

function buildWidget(
  spec: Record<string, unknown>,
  value: unknown,
  path: string,
  design: ResolvedDesign,
  state: BuildState
): WidgetModel | UnsupportedVM {
  const type = String(spec.type ?? '');
  const ctx: WidgetCtx = {
    spec,
    value,
    path,
    keyPrefix: state.keyPrefix,
    design,
    t: state.t,
  };
  const model = evalWidget(type, ctx);
  if (model) return model;
  if (state.unsupported === 'throw') {
    throw new UnsupportedFieldTypeError(type, path);
  }
  return { unsupported: true, type };
}

// ---------------------------------------------------------------------------
// field tree builder
// ---------------------------------------------------------------------------

/** Build the view model for one already-composed field spec. */
export function buildField(
  spec: Record<string, unknown>,
  path: string,
  state: BuildState
): FieldViewModel {
  const fieldType = String(spec.type ?? '');
  const ctx = makeContext(valuePathSegments(path), state.data);
  const design = resolveDesign(spec.design, ctx);
  const label = spec.label ? state.t(spec.label as never) : undefined;
  const description = spec.description ? state.t(spec.description as never) : undefined;
  const wrapperName = wrapperLayerName(path, state.keyPrefix);

  if (fieldType === 'group') {
    return buildGroup(spec, path, design, label, description, state);
  }

  const multiple = resolveMultiple(spec);
  if (multiple) {
    return buildMultipleLeaf(spec, path, design, label, description, multiple, state);
  }

  const lang = resolveLang(spec);
  if (lang) {
    return buildLangLeaf(spec, path, design, label, description, lang, state);
  }

  return buildLeaf(spec, path, design, label, description, wrapperName, state);
}

function buildLeaf(
  spec: Record<string, unknown>,
  path: string,
  design: ResolvedDesign,
  label: string | undefined,
  description: string | undefined,
  wrapperName: string,
  state: BuildState
): FieldViewModel {
  const fieldType = String(spec.type ?? '');
  const uniqid = elementId('', path);
  const value = getValueByPath(state.data, path);

  // checkbox / switcher special envelope.
  if (fieldType === 'checkbox' || fieldType === 'switcher') {
    return {
      shape: 'leaf',
      type: fieldType,
      path,
      wrapperName,
      uniqid,
      design,
      label,
      omitLabel: false,
      description: description || undefined,
      checkbox: true,
      checkboxName: toBracketNotationWithPrefix(path, state.keyPrefix),
      checkboxClass: joinClass('valid-target', design.main.class),
    };
  }

  return {
    shape: 'leaf',
    type: fieldType,
    path,
    wrapperName,
    uniqid,
    design,
    label,
    omitLabel: fieldType === 'hidden',
    description: description || undefined,
    widget: buildWidget(spec, value, path, design, state),
  };
}

function buildGroup(
  spec: Record<string, unknown>,
  path: string,
  design: ResolvedDesign,
  label: string | undefined,
  description: string | undefined,
  state: BuildState
): FieldViewModel {
  const multiple = resolveMultiple(spec);
  if (multiple) {
    return buildMultipleGroup(spec, path, design, label, description, multiple, state);
  }

  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = elementId('', path);
  const groupClass = joinClass('form-group', design.group.class);
  const groupStyle = styleString(design.group.style);

  const children: FieldViewModel[] = [];
  const props = spec.properties as Record<string, Record<string, unknown>> | undefined;
  if (props) {
    for (const [fieldName, fieldSpec] of Object.entries(props)) {
      children.push(buildField(fieldSpec, `${path}.${fieldName}`, state));
    }
  }

  return {
    shape: 'group',
    type: 'group',
    path,
    wrapperName,
    uniqid,
    design,
    label,
    omitLabel: false,
    description: description || undefined,
    groupClass,
    groupStyle,
    children,
  };
}

function buildMultipleLeaf(
  spec: Record<string, unknown>,
  path: string,
  design: ResolvedDesign,
  label: string | undefined,
  description: string | undefined,
  multiple: MultipleSettings,
  state: BuildState
): FieldViewModel {
  const fieldType = String(spec.type ?? '');
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const value = getValueByPath(state.data, path);
  const identities = rowIdentities(value);

  const rows: RowVM[] = identities.map((row, rowIndex) => {
    const rowPath = `${path}.${row.seg}`;
    const rowCtx = makeContext(valuePathSegments(rowPath), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    return {
      uniqid: row.uniqid,
      wrapperClass: inputGroupWrapperClass(rowDesign, rowIndex),
      widget: buildWidget(spec, getValueByPath(state.data, rowPath), rowPath, rowDesign, state),
    };
  });

  return {
    shape: 'multiple-leaf',
    type: fieldType,
    path,
    wrapperName,
    uniqid: elementId('', path),
    design,
    label,
    omitLabel: fieldType === 'hidden',
    description: description || undefined,
    rows,
    multiple,
  };
}

function buildMultipleGroup(
  spec: Record<string, unknown>,
  path: string,
  design: ResolvedDesign,
  label: string | undefined,
  description: string | undefined,
  multiple: MultipleSettings,
  state: BuildState
): FieldViewModel {
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const value = getValueByPath(state.data, path);
  const identities = rowIdentities(value);
  const props = spec.properties as Record<string, Record<string, unknown>> | undefined;

  const rows: RowVM[] = identities.map((row, rowIndex) => {
    const rowBase = `${path}.${row.seg}`;
    const rowCtx = makeContext(valuePathSegments(rowBase), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    const children: FieldViewModel[] = [];
    if (props) {
      for (const [fieldName, fieldSpec] of Object.entries(props)) {
        children.push(buildField(fieldSpec, `${rowBase}.${fieldName}`, state));
      }
    }
    return {
      uniqid: row.uniqid,
      wrapperClass: inputGroupWrapperClass(rowDesign, rowIndex),
      groupClass: joinClass('form-group', rowDesign.group.class),
      children,
    };
  });

  return {
    shape: 'multiple-group',
    type: 'group',
    path,
    wrapperName,
    uniqid: elementId('', path),
    design,
    label,
    omitLabel: false,
    description: description || undefined,
    rows,
    multiple,
  };
}

function buildLangLeaf(
  spec: Record<string, unknown>,
  path: string,
  design: ResolvedDesign,
  label: string | undefined,
  description: string | undefined,
  lang: LangSettings,
  state: BuildState
): FieldViewModel {
  const fieldType = String(spec.type ?? '');
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = elementId('', path);

  const frameClass = lang.frame ? 'lang-group' : 'lang-group p-0 border-0';
  const groupClass = joinClass(frameClass, lang.groupClass);
  const title = lang.title ? state.t(lang.title as never) : '';

  const children: LangChildVM[] = lang.langs.map((code) => {
    const langPath = `${path}.${code}`;
    const langCtx = makeContext(valuePathSegments(langPath), state.data);
    const langDesign = resolveDesign(spec.design, langCtx);
    return {
      code,
      widget: buildWidget(
        spec,
        getValueByPath(state.data, langPath),
        langPath,
        langDesign,
        state
      ),
    };
  });

  return {
    shape: 'lang',
    type: fieldType,
    path,
    wrapperName,
    uniqid,
    design,
    label,
    omitLabel: fieldType === 'hidden',
    description: description || undefined,
    lang: {
      groupClass,
      title: title || undefined,
      children,
    },
  };
}
