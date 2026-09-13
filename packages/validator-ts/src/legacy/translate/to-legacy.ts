/**
 * Reverse translator: schema spec object → legacy spec object — REVERSIBLE keys only.
 *
 * The round-trip check (SPEC §6) requires legacy→schema→legacy = original only for
 * the analysis reversible set. This reverse pass inverts exactly those schema
 * constructs back to their canonical legacy form:
 *
 *   validate slot            → rules{…}
 *   design.class/.style      → class / style (main node)
 *   design.{node}.class      → {node}_class (label/wrapper/group/prepend)
 *   design.show (path expr)  → display_target (1:1 target, expression form)
 *   design.show (cond map)   → display_target + display_target_condition_style
 *   design.class (cond map)  → display_target + display_target_condition_class
 *   behavior.{on*}           → on* scripts
 *   lang bucket              → lang:append + langs/lang_name/lang_key/remove_lang_x/lang_group_class
 *   multiple bucket          → multiple/multiple_max/sortable/list_button_text/multiple_button_onclick
 *   items.{model,…}          → items (dynamic source) / items (static)
 *   options.{key}            → type-dependent key (flattened back to top level)
 *   $ref / passthrough       → same key
 *
 * It does NOT invert irreversible absorptions (display_switch / $patch /
 * x{key} / messages / plural targets / multiple:only) — those fields are
 * excluded from the reversible set by the translator's note log (R7). Feeding
 * an irreversible construct here is a no-op-ish best effort, never relied upon.
 *
 * Pure, recursive over `properties`. No `eval`. No mutation of the input.
 */

import type { LegacySpec, SchemaSpec } from './types';

/** schema design node → legacy `{node}_class` key. */
const NODE_TO_LEGACY_CLASS: Record<string, string> = {
  label: 'label_class',
  wrapper: 'wrapper_class',
  group: 'group_class',
  prepend: 'prepend_class',
};

/** schema lang sub-key → [legacy key, inverted?]. */
const LANG_SUB_TO_LEGACY: Record<string, [legacyKey: string, invert: boolean]> = {
  only: ['langs', false],
  name: ['lang_name', false],
  key: ['lang_key', false],
  group_class: ['lang_group_class', false],
  frame: ['remove_lang_frame', true],
  title: ['remove_lang_title', true],
};

/** schema multiple sub-key → legacy key (canonical inverse for the round-trip set). */
const MULTIPLE_SUB_TO_LEGACY: Record<string, string> = {
  max: 'multiple_max',
  onclick: 'multiple_button_onclick',
};

const ITEMS_SOURCE_KEYS = new Set(['model', 'method', 'table', 'relations', 'api_server']);

/** Reverse-translate a schema ROOT spec → legacy (reversible keys only). */
export function translateToLegacy(schema: SchemaSpec): LegacySpec {
  return reverseSpec(schema);
}

function reverseSpec(schema: SchemaSpec): LegacySpec {
  const out: LegacySpec = {};

  for (const key of Object.keys(schema)) {
    const value = schema[key];
    switch (key) {
      case 'type':
      case 'name':
      case 'default':
      case 'label':
      case 'description':
      case 'placeholder':
      case 'prepend':
      case 'append':
      case 'help':
      case '$ref':
        out[key] = value;
        break;

      case 'properties':
        if (isObject(value)) out.properties = reverseProperties(value as SchemaSpec);
        else out.properties = value;
        break;

      case 'validate':
        reverseValidate(value, out);
        break;

      case 'design':
        reverseDesign(value, out);
        break;

      case 'behavior':
        reverseBehavior(value, out);
        break;

      case 'options':
        reverseOptions(value, out);
        break;

      case 'lang':
        reverseLang(value, out);
        break;

      case 'multiple':
        reverseMultiple(value, out);
        break;

      case 'items':
        reverseItems(value, out);
        break;

      case 'buttons':
        out.buttons = Array.isArray(value) ? value.map(reverseButton) : value;
        break;

      default:
        // Unknown / irreversible residue ($patch, etc.) — carry verbatim.
        out[key] = value;
        break;
    }
  }
  return out;
}

/** FormButton → legacy button: link → a, design.class → class, behavior.onclick → onclick. */
function reverseButton(button: unknown): unknown {
  if (!isObject(button)) return button;
  const out: LegacySpec = {};
  for (const [key, value] of Object.entries(button as Record<string, unknown>)) {
    if (key === 'type') out.type = value === 'link' ? 'a' : value;
    else if (key === 'design' && isObject(value) && 'class' in value) out.class = (value as Record<string, unknown>).class;
    else if (key === 'behavior' && isObject(value) && 'onclick' in value) out.onclick = (value as Record<string, unknown>).onclick;
    else out[key] = value;
  }
  return out;
}

function reverseProperties(props: SchemaSpec): LegacySpec {
  const out: LegacySpec = {};
  for (const name of Object.keys(props)) {
    const child = props[name];
    if (name === '$ref') {
      out.$ref = child;
    } else if (name === '$patch') {
      out.$patch = child; // irreversible residue carried as-is
    } else if (isObject(child)) {
      out[name] = reverseSpec(child as SchemaSpec);
    } else {
      out[name] = child;
    }
  }
  return out;
}

/** validate slot → rules{…}. */
function reverseValidate(value: unknown, out: LegacySpec): void {
  if (value === true || value === false) {
    out.rules = value;
    return;
  }
  if (isObject(value)) {
    out.rules = { ...(value as Record<string, unknown>) };
  }
}

/** design slot → class/style + {node}_class + display_target(+condition). */
function reverseDesign(value: unknown, out: LegacySpec): void {
  if (!isObject(value)) return;
  const d = value as Record<string, unknown>;

  for (const k of Object.keys(d)) {
    const v = d[k];
    if (k === 'class') {
      out.class = v;
    } else if (k === 'style') {
      out.style = v;
    } else if (k in NODE_TO_LEGACY_CLASS) {
      // design.{node}.class → {node}_class.
      if (isObject(v) && 'class' in (v as Record<string, unknown>)) {
        out[NODE_TO_LEGACY_CLASS[k]] = (v as Record<string, unknown>).class;
      }
      // design.{node}.style → {node}_style not in the reversible set; skip.
    } else if (k === 'show') {
      reverseShow(v, out);
    } else {
      // Unknown design node — carry as-is.
      out[k] = v;
    }
  }
}

/** design.show → display_target / display_target_condition_style (1:1 target). */
function reverseShow(show: unknown, out: LegacySpec): void {
  if (typeof show === 'string') {
    // Plain path expression → display_target with that expression.
    out.display_target = show;
    return;
  }
  if (isObject(show)) {
    // Boolean condition map { '.target==val': bool, true: false } → recover
    // display_target + display_target_condition_style.
    const m = show as Record<string, boolean>;
    const styleMap: Record<string, string> = {};
    let target: string | undefined;
    for (const cond of Object.keys(m)) {
      if (cond === 'true') continue;
      const parsed = parseEqCondition(cond);
      if (parsed) {
        target = `.${parsed.path}`;
        styleMap[parsed.value] = m[cond] ? 'display:block' : 'display:none';
      }
    }
    if (target !== undefined) {
      out.display_target = target;
      out.display_target_condition_style = styleMap;
    }
  }
}

/** Parse `.path==value` (value numeric or 'quoted') → {path, value}. */
function parseEqCondition(cond: string): { path: string; value: string } | null {
  const m = /^\.([\w.*]+)==(.+)$/.exec(cond.trim());
  if (!m) return null;
  let value = m[2].trim();
  if (/^'.*'$/.test(value)) value = value.slice(1, -1);
  return { path: m[1], value };
}

/** behavior slot → on* scripts. */
function reverseBehavior(value: unknown, out: LegacySpec): void {
  if (!isObject(value)) return;
  const b = value as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    out[k] = b[k];
  }
}

/** options slot → flattened type-dependent keys (round-trip inverse). */
function reverseOptions(value: unknown, out: LegacySpec): void {
  if (!isObject(value)) return;
  const o = value as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    out[k] = o[k];
  }
}

/** lang bucket → lang:append + langs/lang_name/lang_key/remove_lang_x/lang_group_class. */
function reverseLang(value: unknown, out: LegacySpec): void {
  if (value === true) {
    out.lang = true;
    return;
  }
  if (!isObject(value)) return;
  const l = value as Record<string, unknown>;
  for (const k of Object.keys(l)) {
    if (k === 'mode') {
      out.lang = l.mode;
    } else if (k in LANG_SUB_TO_LEGACY) {
      const [legacyKey, invert] = LANG_SUB_TO_LEGACY[k];
      out[legacyKey] = invert ? !l[k] : l[k];
    } else {
      out[k] = l[k];
    }
  }
}

/** multiple bucket → multiple/multiple_max/sortable/list_button_text/multiple_button_onclick. */
function reverseMultiple(value: unknown, out: LegacySpec): void {
  if (value === true) {
    out.multiple = true;
    return;
  }
  if (value === false) {
    out.multiple = false;
    return;
  }
  if (!isObject(value)) return;
  const m = value as Record<string, unknown>;
  // The presence of a settings object implies multiple is on.
  out.multiple = true;
  for (const k of Object.keys(m)) {
    if (k === 'copy') {
      if (m.copy) out.add_buttons = true;
    } else if (k === 'sortable') {
      if (m.sortable) out.sortable = true;
    } else if (k in MULTIPLE_SUB_TO_LEGACY) {
      out[MULTIPLE_SUB_TO_LEGACY[k]] = m[k];
    } else {
      out[k] = m[k];
    }
  }
}

/** items → static items or dynamic source (round-trips both shapes). */
function reverseItems(value: unknown, out: LegacySpec): void {
  if (Array.isArray(value)) {
    out.items = value;
    return;
  }
  if (isObject(value)) {
    const it = value as Record<string, unknown>;
    const keys = Object.keys(it);
    // A dynamic source: every key is a source key, OR source keys plus a nested
    // `items` placeholder (the real corpus shape). Scatter the source keys back
    // to siblings and restore the placeholder as the sibling `items`.
    const isSource =
      keys.length > 0 &&
      keys.some((k) => ITEMS_SOURCE_KEYS.has(k)) &&
      keys.every((k) => ITEMS_SOURCE_KEYS.has(k) || k === 'items');
    if (isSource) {
      for (const k of keys) {
        if (k === 'items') {
          out.items = it[k]; // placeholder static items → sibling items
        } else {
          out[k] = it[k]; // model/method/table/relations/api_server → siblings
        }
      }
    } else {
      out.items = value;
    }
    return;
  }
  out.items = value;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
