/**
 * CRUDUI widget evaluator (framework-agnostic core) — markup 0, evaluation only.
 *
 * This is the value-computation half of the former fields.ts: it derives the
 * per-widget ATTRIBUTE values, CONTENT strings, item classification (static vs
 * dynamic {model} source), and inline script text for one leaf field, WITHOUT
 * emitting any markup. The React/Vue/Svelte adapters consume the returned
 * `WidgetModel` and assemble the real element tree (JSX / h() / .svelte) — none
 * of them recompute a single value.
 *
 * What it inherits unchanged from fields.ts:
 *  - the data-attr trio (data-name/data-rule-name/data-default) via util.ts
 *    leafName/ruleNameForPath/phpString,
 *  - the main-node class base + resolved design.class (the legacy element_class slot),
 *  - placeholder/prepend/append CONTENT via t() over LocalizedText,
 *  - behavior → opaque on-event attrs (no minify, no expr eval),
 *  - options.* chrome settings → data-* values,
 *  - items source classification: static array | value-label map → [key,label][];
 *    dynamic { model, ... } → STUB (never enumerated, no fabricated options),
 *  - value formatting (date/datetime), applyDefaultString display value.
 *
 * No legacy meta key is read; no markup string is built; eval is never called.
 */

import { formatDateValue } from './date';
import {
  applyDefaultString,
  cleanStr,
  elementId,
  controlId,
  joinClass,
  leafName,
  phpString,
  phpTruthy,
  ruleNameForPath,
  styleString,
  toBracketNotationWithPrefix,
} from './util';
import type { ResolvedDesign } from './design';
import type { Translate } from './content';

/** Inputs every widget evaluator needs for one leaf field. */
export interface WidgetCtx {
  /** Stable DOM identifier prefix. */
  idPrefix?: string;
  /** The composed (single-spec) field node. */
  spec: Record<string, unknown>;
  /** The field's current value. */
  value: unknown;
  /** Dot path within the form. */
  path: string;
  /** Positions of repeated rows in the path, derived from form structure. */
  rowSegments?: readonly number[];
  /** Optional name/id prefix. */
  keyPrefix?: string;
  /** Resolved design appearance for this field. */
  design: ResolvedDesign;
  /** Content translator (active language). */
  t: Translate;
}

/** Flat attribute bag (exact HTML attribute names, lowercase). */
export type Attrs = Record<string, string>;

/** A prepend/append affix span (content + optional class/style). */
export interface Affix {
  /** Translated affix text. */
  text: string;
  /** CSS class. */
  class?: string;
  /** Inline style. */
  style?: string;
}

/** One static option for select/choice/multichoice/search. */
export interface OptionModel {
  /** Submitted value. */
  value: string;
  /** Display label (translated). */
  label: string;
  /** Selected/checked for the current value. */
  selected: boolean;
  /** This option equals the spec default (choice data-is-default). */
  isDefault: boolean;
  /** DOM id for the paired input (choice/multichoice). */
  id?: string;
}

/** data-source-* descriptor for a dynamic {model} items stub. */
export type SourceAttrs = Attrs;

/**
 * The fully-evaluated, markup-free description of one leaf widget. A field
 * adapter renders the element tree from THIS — it computes nothing.
 */
export interface WidgetModel {
  /** Resolved field type (registry key). */
  kind: string;
  /** Layout family for the adapter (how to wrap the control). */
  layout:
    | 'input-group' // prepend? + control + append? inside .input-group
    | 'bare' // control alone (password/hidden/datetime)
    | 'host-script' // control + trailing <script> chrome (editors/tagify)
    | 'btn-group' // radios/checkboxes inside .btn-group
    | 'file' // image/file/cover file-input cluster inside .input-group
    | 'display' // dummy/dummy-input/image-viewer display-only
    | 'search' // select2 host: style?/script + .input-group field-search
    | 'button'; // action: script + hidden + button
  /** Main control element name ('input'|'select'|'textarea'|'div'). */
  tag?: 'input' | 'select' | 'textarea' | 'div';
  /** Main control attributes (lowercase HTML names). Empty for file/cover. */
  attrs: Attrs;
  /** Textarea/dummy text content (already display-resolved). */
  text?: string;
  /** RAW html for a display widget (dummy/image-viewer) — passes unescaped. */
  rawHtml?: string;
  /** Static options (select/choice/multichoice/search). */
  options?: OptionModel[];
  /** Dynamic source stub descriptor (data-source-* attrs), or null when static. */
  source?: SourceAttrs | null;
  /** Prepend affix (content + design.prepend node). */
  prepend?: Affix;
  /** Append affix (content). */
  append?: Affix;
  /** Per-option label class (choice/multichoice). */
  itemLabelClass?: string;
  /** Inline script chrome text (editors/tagify/search/button). */
  script?: string;
  /** Inline style chrome text (search hide_searching). */
  styleChrome?: string;
  /** Button display caption (action widget). */
  buttonText?: string;
  /** Secondary attrs (button hidden field, image readonly display input). */
  extra?: Record<string, Attrs>;
}

// ---------------------------------------------------------------------------
// Shared value primitives
// ---------------------------------------------------------------------------

function bracketName(ctx: WidgetCtx): string {
  return toBracketNotationWithPrefix(ctx.path, ctx.keyPrefix);
}

/** The legacy data-attr trio as a flat bag. */
function dataAttrs(ctx: WidgetCtx): Attrs {
  return {
    'data-name': leafName(ctx.path, ctx.rowSegments),
    'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
    'data-default': phpString(ctx.spec.default),
  };
}

/** Main-node class: base + resolved design.class (the element slot). */
function mainClass(ctx: WidgetCtx, base: string): string {
  return joinClass(base, ctx.design.main.class);
}

/** Resolved design.style for the main node (canonical), or undefined. */
function mainStyle(ctx: WidgetCtx): string | undefined {
  return styleString(ctx.design.main.style);
}

/** Prepend affix from LocalizedText prepend + design.prepend node. */
function prependAffix(ctx: WidgetCtx): Affix | undefined {
  const content = ctx.spec.prepend;
  if (content === undefined || content === null || content === '') return undefined;
  const text = ctx.t(content as never);
  if (!text) return undefined;
  return {
    text,
    class: joinClass('input-group-text', ctx.design.prepend.class),
    style: styleString(ctx.design.prepend.style),
  };
}

/** Append affix from LocalizedText append (no dedicated design node). */
function appendAffix(ctx: WidgetCtx): Affix | undefined {
  const content = ctx.spec.append;
  if (content === undefined || content === null || content === '') return undefined;
  const text = ctx.t(content as never);
  if (!text) return undefined;
  return { text, class: 'input-group-text' };
}

/** placeholder attribute value, or '' when absent/empty. */
function placeholder(ctx: WidgetCtx): string {
  const p = ctx.spec.placeholder;
  if (p === undefined || p === null || p === '') return '';
  return ctx.t(p as never);
}

/**
 * Behavior slot → opaque on-event attributes (verbatim, no minify, no expr eval,
 * no legacy event→onchange transform). `behavior: false/true` nullifies the slot.
 */
function behaviorAttrs(ctx: WidgetCtx): Attrs {
  const b = ctx.spec.behavior;
  if (b === undefined || b === false || b === true || typeof b !== 'object') return {};
  const out: Attrs = {};
  for (const [action, entry] of Object.entries(b as Record<string, unknown>)) {
    let script: string | undefined;
    if (typeof entry === 'string') script = entry;
    else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).script === 'string'
    ) {
      script = (entry as Record<string, unknown>).script as string;
    }
    if (script) out[action] = script;
  }
  return out;
}

/** A single behavior script for one action (or ''). */
function behaviorScript(ctx: WidgetCtx, action: string): string {
  const b = ctx.spec.behavior;
  if (b === undefined || b === false || b === true || typeof b !== 'object') return '';
  const entry = (b as Record<string, unknown>)[action];
  if (typeof entry === 'string') return entry;
  if (
    entry &&
    typeof entry === 'object' &&
    typeof (entry as Record<string, unknown>).script === 'string'
  ) {
    return (entry as Record<string, unknown>).script as string;
  }
  return '';
}

/** Read one options.* value as a string, or undefined when absent. */
function optStr(ctx: WidgetCtx, key: string, fallback?: string): string | undefined {
  const o = ctx.spec.options;
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const v = (o as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return phpString(v);
  }
  return fallback;
}

/** A required options.* value with a default (always a string). */
function optWith(ctx: WidgetCtx, key: string, fallback: string): string {
  return optStr(ctx, key, fallback) ?? fallback;
}

/** A DYNAMIC items source is a `{ model, ... }` descriptor (DB-backed). */
function isDynamicItemsSource(items: unknown): items is Record<string, unknown> {
  return (
    items !== null &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    'model' in (items as Record<string, unknown>)
  );
}

/** Static items → [key,label] entries. Dynamic source → [] (never enumerate). */
function itemEntries(items: unknown): Array<[string, unknown]> {
  if (items === null || items === undefined) return [];
  if (Array.isArray(items)) return items.map((v, i) => [String(i), v]);
  if (typeof items === 'object') {
    if (isDynamicItemsSource(items)) return [];
    return Object.entries(items as Record<string, unknown>);
  }
  return [];
}

/** data-source-* attrs for a dynamic items stub (opaque descriptor passthrough). */
function dynamicSourceAttrs(items: Record<string, unknown>): SourceAttrs {
  return {
    'data-source-model': phpString(items.model),
    'data-source-method': items.method !== undefined ? phpString(items.method) : '',
    'data-source-table': items.table !== undefined ? phpString(items.table) : '',
    'data-source-relations':
      'relations' in items ? JSON.stringify(items.relations ?? []) : '[]',
  };
}

/** accept attr: validate.accept (or options.accept), default fallback. */
function acceptAttr(ctx: WidgetCtx, fallback: string): string {
  const validate = ctx.spec.validate;
  if (validate && typeof validate === 'object' && !Array.isArray(validate)) {
    const a = (validate as Record<string, unknown>).accept;
    if (typeof a === 'string' && a) return a;
  }
  return optWith(ctx, 'accept', fallback);
}

/** image/file/cover size + preview constraints → data-* attrs. */
function sizeAttrs(ctx: WidgetCtx): Attrs {
  return {
    'data-max-width': optWith(ctx, 'max_width', '0'),
    'data-min-width': optWith(ctx, 'min_width', '0'),
    'data-max-height': optWith(ctx, 'max_height', '0'),
    'data-min-height': optWith(ctx, 'min_height', '0'),
    'data-preview-max-width': optWith(ctx, 'preview_max_width', '0'),
    'data-preview-max-height': optWith(ctx, 'preview_max_height', '0'),
  };
}

function nl2br(s: string): string {
  return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

// ---------------------------------------------------------------------------
// per-widget evaluators (kind → WidgetModel)
// ---------------------------------------------------------------------------

interface EvaluatorContext extends WidgetCtx {
  controlId: string;
}

type Evaluator = (ctx: EvaluatorContext) => WidgetModel;

function scriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function textLike(inputType: string): Evaluator {
  return (ctx) => {
    const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
    const attrs: Attrs = {
      type: inputType,
      name: bracketName(ctx),
      value: displayValue,
      class: mainClass(ctx, 'valid-target form-control'),
      ...(placeholder(ctx) ? { placeholder: placeholder(ctx) } : {}),
      ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    };
    return {
      kind: inputType,
      layout: 'input-group',
      tag: 'input',
      attrs,
      prepend: prependAffix(ctx),
      append: appendAffix(ctx),
    };
  };
}

const password: Evaluator = (ctx) => ({
  kind: 'password',
  layout: 'bare',
  tag: 'input',
  attrs: {
    type: 'password',
    name: bracketName(ctx),
    value: phpString(ctx.value),
    class: mainClass(ctx, 'valid-target form-control'),
    ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
    ...dataAttrs(ctx),
  },
});

const textarea: Evaluator = (ctx) => ({
  kind: 'textarea',
  layout: 'input-group',
  tag: 'textarea',
  text: applyDefaultString(ctx.value, ctx.spec.default),
  attrs: {
    name: bracketName(ctx),
    class: mainClass(ctx, 'valid-target form-control'),
    rows: '5',
    ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
    ...behaviorAttrs(ctx),
    ...dataAttrs(ctx),
  },
  prepend: prependAffix(ctx),
  append: appendAffix(ctx),
});

const select: Evaluator = (ctx) => {
  const items = ctx.spec.items;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return ctx.value === undefined ? phpString(ctx.spec.default) : v;
  })();

  if (isDynamicItemsSource(items)) {
    return {
      kind: 'select',
      layout: 'input-group',
      tag: 'select',
      attrs: {
        name: bracketName(ctx),
        class: mainClass(ctx, 'valid-target form-select valid-target-async'),
        ...dynamicSourceAttrs(items),
        ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
        ...behaviorAttrs(ctx),
        ...dataAttrs(ctx),
      },
      source: dynamicSourceAttrs(items),
      options: [{ value: '', label: 'select', selected: false, isDefault: false }],
      prepend: prependAffix(ctx),
      append: appendAffix(ctx),
    };
  }

  const entries = itemEntries(items);
  const options: OptionModel[] =
    entries.length === 0
      ? [{ value: '', label: 'select', selected: false, isDefault: false }]
      : entries.map(([key, val]) => ({
          value: key,
          label: ctx.t(val as never) || phpString(val),
          selected: effectiveValue === key,
          isDefault: false,
        }));

  return {
    kind: 'select',
    layout: 'input-group',
    tag: 'select',
    attrs: {
      name: bracketName(ctx),
      class: mainClass(ctx, 'valid-target form-select'),
      ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
    source: null,
    options,
    prepend: prependAffix(ctx),
    append: appendAffix(ctx),
  };
};

const hidden: Evaluator = (ctx) => ({
  kind: 'hidden',
  layout: 'bare',
  tag: 'input',
  attrs: {
    type: 'hidden',
    name: bracketName(ctx),
    value: applyDefaultString(ctx.value, ctx.spec.default),
    class: mainClass(ctx, 'valid-target'),
    ...dataAttrs(ctx),
  },
});

const choice: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const items = ctx.spec.items;
  const dataName = leafName(ctx.path, ctx.rowSegments);
  const dataRuleName = ruleNameForPath(ctx.path, ctx.rowSegments);
  const onchange = behaviorScript(ctx, 'onchange');
  const onclick = behaviorScript(ctx, 'onclick');
  const onAttrs: Attrs = {
    ...(onchange ? { onchange } : {}),
    ...(onclick ? { onclick } : {}),
  };
  const labelClass = joinClass('btn btn-switch', ctx.design.main.class);

  if (isDynamicItemsSource(items)) {
    return {
      kind: 'choice',
      layout: 'btn-group',
      attrs: {
        class: 'btn-group btn-group-toggle',
        'data-toggle': 'buttons',
        ...dynamicSourceAttrs(items),
      },
      source: dynamicSourceAttrs(items),
      options: [],
      itemLabelClass: labelClass,
    };
  }

  const defaultStr =
    ctx.spec.default !== undefined &&
    ctx.spec.default !== null &&
    !Array.isArray(ctx.spec.default)
      ? phpString(ctx.spec.default)
      : null;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return ctx.value === undefined ? defaultStr ?? '' : v;
  })();
  const idPrefix = elementId('choice', ctx.path);

  const options: OptionModel[] = itemEntries(items).map(([key, label], index) => {
    const value = String(key);
    return {
      value,
      label: ctx.t(label as never) || phpString(label),
      selected: effectiveValue === value,
      isDefault: defaultStr !== null && defaultStr === value,
      id: `${idPrefix}-${index + 1}`,
    };
  });

  return {
    kind: 'choice',
    layout: 'btn-group',
    attrs: { class: 'btn-group btn-group-toggle', 'data-toggle': 'buttons' },
    source: null,
    options,
    itemLabelClass: labelClass,
    extra: {
      // per-input shared attrs (name + data trio + onchange/onclick).
      input: {
        name,
        'data-name': dataName,
        'data-rule-name': dataRuleName,
        ...onAttrs,
      },
    },
  };
};

const multichoice: Evaluator = (ctx) => {
  const bracketBase = bracketName(ctx);
  const name = `${bracketBase}[]`;
  const items = ctx.spec.items;
  const dataName = leafName(ctx.path, ctx.rowSegments);
  const dataRuleName = ruleNameForPath(ctx.path, ctx.rowSegments);
  const onchange = behaviorScript(ctx, 'onchange');
  const labelClass = joinClass('btn btn-switch btn-mswitch', ctx.design.main.class);

  if (isDynamicItemsSource(items)) {
    return {
      kind: 'multichoice',
      layout: 'btn-group',
      attrs: {
        class: 'btn-group flex-wrap btn-group-toggle',
        ...dynamicSourceAttrs(items),
      },
      source: dynamicSourceAttrs(items),
      options: [],
      itemLabelClass: labelClass,
    };
  }

  let selectedValues: string[];
  if (Array.isArray(ctx.value)) selectedValues = (ctx.value as unknown[]).map(String);
  else if (ctx.value) selectedValues = [String(ctx.value)];
  else selectedValues = [];
  if (
    ctx.value === undefined &&
    ctx.spec.default !== undefined &&
    ctx.spec.default !== null
  ) {
    selectedValues = Array.isArray(ctx.spec.default)
      ? (ctx.spec.default as unknown[]).map((d) => phpString(d))
      : [phpString(ctx.spec.default)];
  }

  const idPrefix = `mchoice-${cleanStr(name)}`;
  const options: OptionModel[] = itemEntries(items).map(([key, label], index) => {
    const value = String(key);
    return {
      value,
      label: ctx.t(label as never) || phpString(label),
      selected: selectedValues.includes(value),
      isDefault: false,
      id: `${idPrefix}${index + 1}`,
    };
  });

  return {
    kind: 'multichoice',
    layout: 'btn-group',
    attrs: { class: 'btn-group flex-wrap btn-group-toggle' },
    source: null,
    options,
    itemLabelClass: labelClass,
    extra: {
      input: {
        name,
        'data-name': dataName,
        'data-rule-name': dataRuleName,
        ...(onchange ? { onchange } : {}),
      },
    },
  };
};

const date: Evaluator = (ctx) => {
  const rawValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'date',
    layout: 'input-group',
    tag: 'input',
    attrs: {
      type: 'date',
      name: bracketName(ctx),
      value: formatDateValue(rawValue, 'YYYY-MM-DD'),
      class: mainClass(ctx, 'valid-target form-control'),
      ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
    prepend: prependAffix(ctx),
    append: appendAffix(ctx),
  };
};

const datetime: Evaluator = (ctx) => {
  const rawValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'datetime',
    layout: 'bare',
    tag: 'input',
    attrs: {
      type: 'datetime-local',
      name: bracketName(ctx),
      value: formatDateValue(rawValue, 'YYYY-MM-DDTHH:mm:ss'),
      class: mainClass(ctx, 'valid-target form-control'),
      ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
  };
};

const dummy: Evaluator = (ctx) => {
  let v: unknown = ctx.value === undefined ? ctx.spec.default : ctx.value;
  const items = ctx.spec.items;
  if (
    items &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    !isDynamicItemsSource(items)
  ) {
    const looked = (items as Record<string, unknown>)[phpString(v)];
    if (looked !== undefined) v = looked;
  }
  const textVal = phpString(v);
  // RAW html passthrough — value goes through nl2br only (not escaped), legacy parity.
  const rawHtml = phpTruthy(textVal) ? nl2br(textVal) : textVal;
  const attrs: Attrs = {
    ...(ctx.design.main.class ? { class: ctx.design.main.class } : {}),
    ...(styleString(ctx.design.main.style)
      ? { style: styleString(ctx.design.main.style)! }
      : {}),
  };
  return {
    kind: 'dummy',
    layout: 'display',
    tag: 'div',
    rawHtml,
    attrs,
  };
};

const dummyInput: Evaluator = (ctx) => {
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'dummy-input',
    layout: 'input-group',
    tag: 'input',
    attrs: {
      type: 'text',
      name: bracketName(ctx),
      value: displayValue,
      readonly: '',
      class: mainClass(ctx, 'form-control'),
      ...(placeholder(ctx) ? { placeholder: placeholder(ctx) } : {}),
      ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
      'data-default': phpString(ctx.spec.default),
    },
    prepend: prependAffix(ctx),
    append: appendAffix(ctx),
  };
};

const image: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, 'image/*');
  const fileClass = joinClass(
    'valid-target form-control-file form-control-image',
    ctx.design.main.class
  );
  return {
    kind: 'image',
    layout: 'file',
    attrs: {},
    prepend: prependAffix(ctx),
    extra: {
      display: {
        type: 'text',
        class: 'form-control form-control-file',
        value: '',
        readonly: '',
      },
      file: {
        type: 'file',
        class: fileClass,
        ...sizeAttrs(ctx),
        name,
        'data-name': leafName(ctx.path, ctx.rowSegments),
        'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
        ...behaviorAttrs(ctx),
        value: '',
        accept,
      },
    },
  };
};

const file: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, '*/*');
  const fileClass = joinClass('valid-target form-control-file', ctx.design.main.class);
  return {
    kind: 'file',
    layout: 'file',
    attrs: {},
    prepend: prependAffix(ctx),
    extra: {
      display: {
        type: 'text',
        class: 'form-control form-control-file',
        value: '',
        readonly: '',
      },
      file: {
        type: 'file',
        class: fileClass,
        ...sizeAttrs(ctx),
        name,
        'data-name': leafName(ctx.path, ctx.rowSegments),
        'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
        ...behaviorAttrs(ctx),
        value: '',
        accept,
      },
    },
  };
};

const cover: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const accept = acceptAttr(ctx, 'image/*');
  const fileClass = joinClass(
    'valid-target form-control-file form-control-filetext form-control-image',
    ctx.design.main.class
  );
  return {
    kind: 'cover',
    layout: 'file',
    attrs: {},
    prepend: prependAffix(ctx),
    extra: {
      file: {
        type: 'file',
        class: fileClass,
        ...sizeAttrs(ctx),
        name: `${name}[name]`,
        'data-name': leafName(ctx.path, ctx.rowSegments),
        'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
        ...behaviorAttrs(ctx),
        accept,
      },
    },
  };
};

const imageViewer: Evaluator = (ctx) => {
  const height = optWith(ctx, 'height', '');
  const v = ctx.value;
  const wrapCls = ctx.design.main.class;
  let rawHtml: string;
  if (Array.isArray(v) && v.length > 0) {
    const heightAttr = height ? ` height="${height}"` : '';
    rawHtml = (v as unknown[])
      .map((row) => `<img src="${phpString(row)}"${heightAttr}>`)
      .join('');
  } else {
    // Hardcoded Korean empty literal — kept verbatim (legacy does not translate it).
    rawHtml = '이미지가 없습니다.';
  }
  const attrs: Attrs = wrapCls ? { class: wrapCls } : {};
  return {
    kind: 'image-viewer',
    layout: 'display',
    tag: 'div',
    rawHtml,
    attrs,
  };
};

const search: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const id = ctx.controlId;
  const items = ctx.spec.items;
  const keywordMinLength = optWith(ctx, 'keyword_min_length', '2');
  const delay = optWith(ctx, 'delay', '250');
  const apiServer = optWith(ctx, 'api_server', '');
  // Original (legacy-parity) quirk: absent option → undefined !== '' → true.
  const hideSearching = optStr(ctx, 'hide_searching') !== '';
  const onchange = behaviorScript(ctx, 'onchange');

  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return ctx.value === undefined ? phpString(ctx.spec.default) : v;
  })();

  const dynamic = isDynamicItemsSource(items);
  const options: OptionModel[] = [];
  if (!dynamic && items !== undefined && items !== null) {
    for (const [key, label] of itemEntries(items)) {
      const value = String(key);
      options.push({
        value,
        label: ctx.t(label as never) || phpString(label),
        selected: effectiveValue === value,
        isDefault: false,
      });
    }
  }
  if (options.length === 0) {
    options.push({ value: '', label: 'select', selected: false, isDefault: false });
  }

  const sourceAttrs = dynamic ? dynamicSourceAttrs(items as Record<string, unknown>) : null;
  const selectClass = mainClass(
    ctx,
    dynamic ? 'valid-target form-control valid-target-async' : 'valid-target form-control'
  );

  const selectAttrs: Attrs = {
    class: selectClass,
    ...(mainStyle(ctx) ? { style: mainStyle(ctx)! } : {}),
    name,
    'data-keyword-min-length': keywordMinLength,
    'data-delay': delay,
    'data-api-server': apiServer,
    ...(sourceAttrs ?? {}),
    'data-name': leafName(ctx.path, ctx.rowSegments),
    'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
    id,
    ...(onchange ? { onchange } : {}),
    'data-default': phpString(ctx.spec.default),
  };

  const callback = optStr(ctx, 'callback');
  const callbackJs = callback ? `$(document.getElementById(${scriptString(id)})).on('select2:select', ${callback});` : '';
  const containerClass = `${id}_select2`;
  const styleChrome = hideSearching
    ? `[class~=${scriptString(containerClass)}] .loading-results { display: none; }`
    : '';
  const script = `$(function() {select2(CSS.escape(${scriptString(id)}), ${scriptString(keywordMinLength)}, ${scriptString(delay)}, ${scriptString(containerClass)});${callbackJs}});`;

  return {
    kind: 'search',
    layout: 'search',
    tag: 'select',
    attrs: selectAttrs,
    source: sourceAttrs,
    options,
    prepend: prependAffix(ctx),
    append: appendAffix(ctx),
    script,
    styleChrome,
  };
};

function editorTextarea(
  kind: string,
  baseClass: string,
  rowsDefault: string,
  buildAttrs: (ctx: WidgetCtx, id: string) => Attrs,
  buildScript: (ctx: WidgetCtx, id: string) => string
): Evaluator {
  return (ctx) => {
    const editorId = ctx.controlId;
    const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
    const rows = optWith(ctx, 'rows', rowsDefault);
    return {
      kind,
      layout: 'host-script',
      tag: 'textarea',
      text: displayValue,
      attrs: {
        id: editorId,
        class: mainClass(ctx, baseClass),
        name: bracketName(ctx),
        rows,
        ...buildAttrs(ctx, editorId),
        ...behaviorAttrs(ctx),
        ...dataAttrs(ctx),
      },
      script: buildScript(ctx, editorId),
    };
  };
}

const tinymce: Evaluator = (ctx) => {
  const editorId = ctx.controlId;
  const rows = optWith(ctx, 'rows', '3');
  const height = optWith(ctx, 'height', '300');
  const upload = optWith(ctx, 'fileserver', 'upload');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'tinymce',
    layout: 'host-script',
    tag: 'textarea',
    text: displayValue,
    attrs: {
      id: editorId,
      class: mainClass(ctx, 'valid-target form-control tinymcearea'),
      name: bracketName(ctx),
      rows,
      'data-type': String(ctx.spec.type ?? 'tinymce'),
      'data-height': height,
      'data-upload-server': upload,
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
    script: `$(function() {editor_tinymce('#'+CSS.escape(${scriptString(editorId)}), ${height}, ${scriptString(upload)}, false);});`,
  };
};

const summernote = editorTextarea(
  'summernote',
  'valid-target form-control summernote',
  '5',
  () => ({}),
  (ctx, id) => `$(function() {editor_summernote('#'+CSS.escape(${scriptString(id)}), ${scriptString(optWith(ctx, 'upload', 'upload'))});});`
);

const editorjs = editorTextarea(
  'editorjs',
  'valid-target form-control contentjs',
  '3',
  (ctx) => ({ 'data-fileserver': optWith(ctx, 'fileserver', '') }),
  (ctx, id) => `$(function() {editor_editorjs('#'+CSS.escape(${scriptString(id)}), ${scriptString(optWith(ctx, 'fileserver', ''))});});`
);

const tui = editorTextarea(
  'tui',
  'valid-target form-control tuiarea',
  '3',
  (ctx) => ({ 'data-fileserver': optWith(ctx, 'fileserver', '') }),
  (ctx, id) => `$(function() {editor_tui('#'+CSS.escape(${scriptString(id)}), ${scriptString(optWith(ctx, 'fileserver', ''))});});`
);

const button: Evaluator = (ctx) => {
  const name = bracketName(ctx);
  const id = ctx.controlId;
  const onclick = behaviorScript(ctx, 'onclick');
  const initScript = optStr(ctx, 'init_script') ?? '';
  const script =
    `\n$(function() {\n    ${initScript}\n    $(document.getElementById(${scriptString(id)})).on('click', function() {\n        ${onclick}\n    });\n});\n`;
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  const textVal =
    ctx.spec.content !== undefined
      ? ctx.t(ctx.spec.content as never)
      : ctx.spec.text !== undefined
        ? ctx.t(ctx.spec.text as never)
        : '';
  return {
    kind: 'button',
    layout: 'button',
    script,
    buttonText: textVal,
    attrs: {
      type: 'button',
      class: mainClass(ctx, 'btn'),
      name: `btn${name}`,
      id,
      value: textVal,
    },
    extra: {
      hidden: {
        type: 'hidden',
        class: 'valid-target form-control',
        readonly: '',
        name,
        'data-name': leafName(ctx.path, ctx.rowSegments),
        'data-rule-name': ruleNameForPath(ctx.path, ctx.rowSegments),
        value: displayValue,
        'data-default': phpString(ctx.spec.default),
      },
    },
  };
};

const tagify: Evaluator = (ctx) => {
  const id = ctx.controlId;
  const maxTags = optWith(ctx, 'max_tags', '0');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'tagify',
    layout: 'host-script',
    tag: 'input',
    attrs: {
      type: 'text',
      id,
      class: mainClass(ctx, 'valid-target form-control'),
      name: bracketName(ctx),
      value: displayValue,
      'data-max-tags': maxTags,
      ...(placeholder(ctx) ? { placeholder: placeholder(ctx) } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
    script: `$(function() {editor_tagify('#'+CSS.escape(${scriptString(id)}), ${maxTags});});`,
  };
};

const tagify2: Evaluator = (ctx) => {
  const id = ctx.controlId;
  const maxTags = optWith(ctx, 'max_tags', '0');
  const server = optWith(ctx, 'server', '');
  const displayValue = applyDefaultString(ctx.value, ctx.spec.default);
  return {
    kind: 'tagify2',
    layout: 'host-script',
    tag: 'input',
    attrs: {
      type: 'text',
      id,
      class: mainClass(ctx, 'valid-target form-control'),
      name: bracketName(ctx),
      value: displayValue,
      'data-max-tags': maxTags,
      'data-server': server,
      ...(placeholder(ctx) ? { placeholder: placeholder(ctx) } : {}),
      ...behaviorAttrs(ctx),
      ...dataAttrs(ctx),
    },
    script: `$(function() {editor_tagify2('#'+CSS.escape(${scriptString(id)}), ${maxTags}, ${scriptString(server)});});`,
  };
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, Evaluator> = {
  text: textLike('text'),
  string: textLike('text'),
  email: textLike('email'),
  number: textLike('number'),
  integer: textLike('number'),
  float: textLike('number'),
  decimal: textLike('number'),
  password,
  textarea,
  select,
  dropdown: select,
  selectbox: select,
  hidden,
  choice,
  radio: choice,
  multichoice,
  checkboxes: multichoice,
  checkcontainer: multichoice,
  date,
  datetime,
  'datetime-local': datetime,
  dummy,
  html: dummy,
  static: dummy,
  'dummy-input': dummyInput,
  image,
  file,
  cover,
  'cover-simple': cover,
  'image-viewer': imageViewer,
  search,
  autocomplete: search,
  tinymce,
  wysiwyg: tinymce,
  summernote,
  editorjs,
  tui,
  button,
  action: button,
  tagify,
  tagify2,
};

/** Number of registered widget kinds (incl. aliases). */
export const WIDGET_COUNT = Object.keys(REGISTRY).length;

/**
 * Registered widget keys (every type + alias) — the registry's key set, NOT a
 * copied catalog. `describe`/`list-widgets` enumerate from THIS; adding a key to
 * `REGISTRY` extends it with zero edits elsewhere (drift 0).
 */
export const WIDGET_KINDS: readonly string[] = Object.keys(REGISTRY);

/**
 * `kind → layout family`, derived by running each registry evaluator once with a
 * neutral context and reading the `layout` it returns (a per-evaluator literal,
 * input-independent). This is a projection of the registry, not a hand table:
 * a new evaluator's layout is picked up automatically (drift 0).
 */
export const WIDGET_LAYOUTS: Readonly<Record<string, WidgetModel['layout']>> = (() => {
  const node = { class: '', style: '' };
  const probeCtx: EvaluatorContext = {
    controlId: 'crudui:probe',
    spec: { type: 'probe' },
    value: undefined,
    path: 'probe',
    design: {
      show: true,
      main: { ...node },
      label: { ...node },
      wrapper: { ...node },
      group: { ...node },
      prepend: { ...node },
    } as ResolvedDesign,
    t: ((v: unknown) => (typeof v === 'string' ? v : '')) as unknown as Translate,
  };
  const out: Record<string, WidgetModel['layout']> = {};
  for (const [kind, evaluator] of Object.entries(REGISTRY)) {
    out[kind] = evaluator(probeCtx).layout;
  }
  return out;
})();

/**
 * `registryKey → canonical kind`, where the canonical kind is the `kind` the
 * evaluator itself emits. Two keys mapping to the same evaluator share a
 * canonical kind, so this exposes alias groups WITHOUT reading the private
 * REGISTRY references (e.g. `dropdown`/`selectbox` → `select`). A projection of
 * the registry — new aliases surface automatically (drift 0).
 */
export const WIDGET_CANONICAL: Readonly<Record<string, string>> = (() => {
  const node = { class: '', style: '' };
  const probeCtx: EvaluatorContext = {
    controlId: 'crudui:probe',
    spec: { type: 'probe' },
    value: undefined,
    path: 'probe',
    design: {
      show: true,
      main: { ...node },
      label: { ...node },
      wrapper: { ...node },
      group: { ...node },
      prepend: { ...node },
    } as ResolvedDesign,
    t: ((v: unknown) => (typeof v === 'string' ? v : '')) as unknown as Translate,
  };
  const out: Record<string, string> = {};
  for (const [key, evaluator] of Object.entries(REGISTRY)) {
    out[key] = evaluator(probeCtx).kind;
  }
  return out;
})();

/** Evaluate one leaf field to a markup-free WidgetModel, or undefined if unported. */
export function evalWidget(type: string, ctx: WidgetCtx): WidgetModel | undefined {
  const ev = REGISTRY[type.toLowerCase()];
  if (!ev) return undefined;
  const id = controlId(ctx.idPrefix ?? 'crudui', ctx.path);
  const widget = ev({ ...ctx, controlId: id });
  if (widget.tag && ['input', 'select', 'textarea'].includes(widget.tag)) {
    widget.attrs.id = id;
  }
  if (widget.extra?.file) widget.extra.file.id = id;
  if (widget.layout === 'btn-group') {
    for (const [index, option] of (widget.options ?? []).entries()) option.id = `${id}:${index}`;
  }
  return widget;
}

/** True when a field `type` has a registered widget evaluator. */
export function hasWidget(type: string): boolean {
  return Boolean(REGISTRY[type.toLowerCase()]);
}
