/** Evaluate prepared form fields, values and conditions for framework adapters. */

import {
  elementId,
  controlId,
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
import type { FormFieldTemplate } from './form';

/** Behavior when a field `type` has no registered widget. */
export type UnsupportedMode = 'throw' | 'marker';

/** Per-build state threaded through the recursive tree builder. */
export interface BuildState {
  /** Stable DOM identifier prefix. */
  idPrefix?: string;
  /** The root form data (the expr engine's formData). */
  data: Record<string, unknown>;
  /** Optional name/id prefix. */
  keyPrefix?: string;
  /** Content translator (active language). */
  t: Translate;
  /** Unsupported-type handling (default 'throw' — never silent). */
  unsupported: UnsupportedMode;
  /** Repeated path segment positions, independent of their key encoding. */
  rowSegments?: readonly number[];
}

/** Discriminator for the four field shapes. */
export type FieldShape = 'leaf' | 'group' | 'multiple-leaf' | 'multiple-group' | 'lang';

/** One repeated row and its evaluated fields. */
export interface RowVM {
  /** Row key used by the framework adapter and row operations. */
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
  /** Language code. */
  code: string;
  /** Evaluated language input. */
  widget: WidgetModel | UnsupportedVM;
}

/** A surfaced unsupported-type marker (only in 'marker' mode). */
export interface UnsupportedVM {
  /** Unsupported field discriminator. */
  unsupported: true;
  /** Requested widget type. */
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
  /** DOM identifier for a standalone checkbox. */
  checkboxId?: string;
  /** checkbox main class (valid-target + design.main). */
  checkboxClass?: string;
  /** Checked state from the bound data. */
  checkboxChecked?: boolean;
  /** Group children (group shape). */
  children?: FieldViewModel[];
  /** .form-group class + style (group shape). */
  groupClass?: string;
  /** Resolved group inline style. */
  groupStyle?: string;
  /** Repeated rows (multiple-leaf/multiple-group shape). */
  rows?: RowVM[];
  /** Row buttons settings (multiple shape). */
  multiple?: MultipleSettings;
  /** Lang container (lang shape). */
  lang?: {
    /** Language container class. */
    groupClass: string;
    /** Translated language section title. */
    title?: string;
    /** One input model per language. */
    children: LangChildVM[];
  };
}

// ---------------------------------------------------------------------------
// multiple / lang settings (ported from render.ts)
// ---------------------------------------------------------------------------

export interface MultipleSettings {
  show: boolean;
  min?: number;
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
      min: typeof o.min === 'number' ? o.min : undefined,
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
  if (Array.isArray(value)) {
    return value.map((_, i) => ({ seg: positionSegment(i), uniqid: String(i) }));
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.map((k) => ({ seg: k, uniqid: k }));
  }
  // Missing data creates one initial row.
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
    idPrefix: state.idPrefix,
    design,
    t: state.t,
    rowSegments: state.rowSegments,
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
  state: BuildState,
  children: readonly FormFieldTemplate[]
): FieldViewModel {
  const fieldType = String(spec.type ?? '');
  const ctx = makeContext(valuePathSegments(path), state.data);
  const design = resolveDesign(spec.design, ctx);
  const label = spec.label ? state.t(spec.label as never) : undefined;
  const description = spec.description ? state.t(spec.description as never) : undefined;
  const wrapperName = wrapperLayerName(path, state.keyPrefix);

  if (fieldType === 'group') {
    return buildGroup(spec, path, design, label, description, state, children);
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
      checkboxId: controlId(state.idPrefix ?? 'crudui', path),
      checkboxName: toBracketNotationWithPrefix(path, state.keyPrefix),
      checkboxClass: joinClass('valid-target', design.main.class),
      checkboxChecked: value === true || value === 1 || value === '1' ||
        (value === undefined && (spec.default === true || spec.default === 1 || spec.default === '1')),
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
  state: BuildState,
  templateChildren: readonly FormFieldTemplate[]
): FieldViewModel {
  const multiple = resolveMultiple(spec);
  if (multiple) {
    return buildMultipleGroup(spec, path, design, label, description, multiple, state, templateChildren);
  }

  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const uniqid = elementId('', path);
  const groupClass = joinClass('form-group', design.group.class);
  const groupStyle = styleString(design.group.style);

  const children = buildChildren(path, state, templateChildren);

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
  const rowState = { ...state, rowSegments: [...(state.rowSegments ?? []), valuePathSegments(path).length] };

  const rows: RowVM[] = identities.map((row, rowIndex) => {
    const rowPath = `${path}.${row.seg}`;
    const rowCtx = makeContext(valuePathSegments(rowPath), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    return {
      uniqid: row.uniqid,
      wrapperClass: inputGroupWrapperClass(rowDesign, rowIndex),
      widget: buildWidget(spec, getValueByPath(state.data, rowPath), rowPath, rowDesign, rowState),
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
  state: BuildState,
  templateChildren: readonly FormFieldTemplate[]
): FieldViewModel {
  const wrapperName = wrapperLayerName(path, state.keyPrefix);
  const value = getValueByPath(state.data, path);
  const identities = rowIdentities(value);
  const rowState = { ...state, rowSegments: [...(state.rowSegments ?? []), valuePathSegments(path).length] };

  const rows: RowVM[] = identities.map((row, rowIndex) => {
    const rowBase = `${path}.${row.seg}`;
    const rowCtx = makeContext(valuePathSegments(rowBase), state.data);
    const rowDesign = resolveDesign(spec.design, rowCtx);
    const children = buildChildren(rowBase, rowState, templateChildren);
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

function buildChildren(
  path: string,
  state: BuildState,
  templates: readonly FormFieldTemplate[]
): FieldViewModel[] {
  return templates.map(field =>
    buildField(field.spec, `${path}.${field.name}`, state, field.children));
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
