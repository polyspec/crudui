/**
 * Reverse translator: v2 spec object → v1 spec object — REVERSIBLE keys only.
 *
 * The round-trip gate (SPEC §6) is v1→v2→v1 = original, and it holds ONLY over
 * the analysis reversible set. This reverse pass inverts exactly those v2
 * constructs back to their canonical v1 form:
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
 * excluded from the round-trip gate by the translator's note log (R7). Feeding
 * an irreversible construct here is a no-op-ish best effort, never relied upon.
 *
 * Pure, recursive over `properties`. No `eval`. No mutation of the input.
 */

import type { V1Spec, V2Spec } from './types';

/** v2 design node → v1 `{node}_class` key. */
const NODE_TO_V1CLASS: Record<string, string> = {
  label: 'label_class',
  wrapper: 'wrapper_class',
  group: 'group_class',
  prepend: 'prepend_class',
};

/** v2 lang sub-key → [v1 key, inverted?]. */
const LANG_SUB_TO_V1: Record<string, [v1Key: string, invert: boolean]> = {
  only: ['langs', false],
  name: ['lang_name', false],
  key: ['lang_key', false],
  group_class: ['lang_group_class', false],
  frame: ['remove_lang_frame', true],
  title: ['remove_lang_title', true],
};

/** v2 multiple sub-key → v1 key (canonical inverse for the round-trip set). */
const MULTIPLE_SUB_TO_V1: Record<string, string> = {
  max: 'multiple_max',
  onclick: 'multiple_button_onclick',
};

const ITEMS_SOURCE_KEYS = new Set(['model', 'method', 'table', 'relations']);

/** Reverse-translate a v2 ROOT spec → v1 (reversible keys only). */
export function translateV2ToV1(v2: V2Spec): V1Spec {
  return reverseSpec(v2);
}

function reverseSpec(v2: V2Spec): V1Spec {
  const out: V1Spec = {};

  for (const key of Object.keys(v2)) {
    const value = v2[key];
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
        if (isObject(value)) out.properties = reverseProperties(value as V2Spec);
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

      default:
        // Unknown / irreversible residue ($patch, etc.) — carry verbatim.
        out[key] = value;
        break;
    }
  }
  return out;
}

function reverseProperties(props: V2Spec): V1Spec {
  const out: V1Spec = {};
  for (const name of Object.keys(props)) {
    const child = props[name];
    if (name === '$ref') {
      out.$ref = child;
    } else if (name === '$patch') {
      out.$patch = child; // irreversible residue carried as-is
    } else if (isObject(child)) {
      out[name] = reverseSpec(child as V2Spec);
    } else {
      out[name] = child;
    }
  }
  return out;
}

/** validate slot → rules{…}. */
function reverseValidate(value: unknown, out: V1Spec): void {
  if (value === true || value === false) {
    out.rules = value;
    return;
  }
  if (isObject(value)) {
    out.rules = { ...(value as Record<string, unknown>) };
  }
}

/** design slot → class/style + {node}_class + display_target(+condition). */
function reverseDesign(value: unknown, out: V1Spec): void {
  if (!isObject(value)) return;
  const d = value as Record<string, unknown>;

  for (const k of Object.keys(d)) {
    const v = d[k];
    if (k === 'class') {
      out.class = v;
    } else if (k === 'style') {
      out.style = v;
    } else if (k in NODE_TO_V1CLASS) {
      // design.{node}.class → {node}_class.
      if (isObject(v) && 'class' in (v as Record<string, unknown>)) {
        out[NODE_TO_V1CLASS[k]] = (v as Record<string, unknown>).class;
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
function reverseShow(show: unknown, out: V1Spec): void {
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
function reverseBehavior(value: unknown, out: V1Spec): void {
  if (!isObject(value)) return;
  const b = value as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    out[k] = b[k];
  }
}

/** options slot → flattened type-dependent keys (round-trip inverse). */
function reverseOptions(value: unknown, out: V1Spec): void {
  if (!isObject(value)) return;
  const o = value as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    out[k] = o[k];
  }
}

/** lang bucket → lang:append + langs/lang_name/lang_key/remove_lang_x/lang_group_class. */
function reverseLang(value: unknown, out: V1Spec): void {
  if (value === true) {
    out.lang = true;
    return;
  }
  if (!isObject(value)) return;
  const l = value as Record<string, unknown>;
  for (const k of Object.keys(l)) {
    if (k === 'mode') {
      out.lang = l.mode;
    } else if (k in LANG_SUB_TO_V1) {
      const [v1Key, invert] = LANG_SUB_TO_V1[k];
      out[v1Key] = invert ? !l[k] : l[k];
    } else {
      out[k] = l[k];
    }
  }
}

/** multiple bucket → multiple/multiple_max/sortable/list_button_text/multiple_button_onclick. */
function reverseMultiple(value: unknown, out: V1Spec): void {
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
    } else if (k in MULTIPLE_SUB_TO_V1) {
      out[MULTIPLE_SUB_TO_V1[k]] = m[k];
    } else {
      out[k] = m[k];
    }
  }
}

/** items → static items or dynamic source (round-trips both shapes). */
function reverseItems(value: unknown, out: V1Spec): void {
  if (Array.isArray(value)) {
    out.items = value;
    return;
  }
  if (isObject(value)) {
    const it = value as Record<string, unknown>;
    const keys = Object.keys(it);
    const allSource = keys.length > 0 && keys.every((k) => ITEMS_SOURCE_KEYS.has(k));
    if (allSource) {
      // Dynamic source keys were scattered at top level in v1.
      for (const k of keys) out[k] = it[k];
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
