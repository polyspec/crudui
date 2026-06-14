/**
 * Forward translator: legacy spec object → CRUDUI spec object (schema §6 absorbs_legacy).
 *
 * Pure SPEC→SPEC rewrite, recursive over `properties`. Applies the analysis
 * `key_mappings` verbatim:
 *   - x{key}/xclass/xstyle comments        : stripped
 *   - display_switch (source)              : distributed to TARGET fields' design.show (annihilation)
 *   - display_target/condition_style/class : design.show / design.class condition maps
 *   - rules{required,match,email,…}        : validate slot
 *   - class/input_class/style/node_class   : design node map
 *   - onchange/onclick/onload              : behavior
 *   - lang:append/langs/lang_x/remove_lang : lang bucket
 *   - multiple_x/sortable/add_buttons      : multiple bucket
 *   - dollar after/before/merge/change/remove : dollar patch
 *   - items dynamic source keys            : items.{model,method,table,relations}
 *   - seqtokey/__13hex__                   : dropped (data-layer hidden id, G4)
 *   - type-dependent / chrome / callbacks  : options (open bucket)
 *   - label/description/name/type/default/properties : passthrough
 *
 * NEVER emits a forbidden meta key — the output passes the CRUDUI meta-schema and the
 * recursive forbidden-scan. NEVER runs `eval`. NEVER mutates the legacy input.
 *
 * Sibling-awareness: display_switch lives on the SOURCE field but its effect
 * lands on TARGET fields, so a properties MAP (not a lone field) is the unit of
 * the display pass. `translateProperties` runs that pass before per-field rewrite.
 */

import type {
  LegacySpec,
  SchemaSpec,
  TranslateResult,
  TranslateNote,
  IrreversibleReason,
} from './types';
import { KEY_MAPPINGS } from './types';

/**
 * The set of R7 reasons KEY_MAPPINGS declares irreversible — the canonical
 * registry. The translator CONSUMES this table: every reason it records via
 * `note()` must be a reason the table marks `reversible:false`. This makes
 * KEY_MAPPINGS the single truth for the reason vocabulary (not doc-only) — a
 * reason emitted here that the table does not list as irreversible is a wiring
 * bug, caught at the call site rather than silently shipped.
 */
const IRREVERSIBLE_REASONS: ReadonlySet<IrreversibleReason> = new Set(
  KEY_MAPPINGS.filter((m) => !m.reversible && m.reason !== undefined).map(
    (m) => m.reason as IrreversibleReason
  )
);

/** First-class keys passed through verbatim (the analysis passthrough set). */
const PASSTHROUGH = new Set([
  'type',
  'name',
  'default',
  'label',
  'description',
  'placeholder',
  'prepend',
  'append',
  'help',
]);

/** legacy design appearance keys → [CRUDUI design node, sub-key]. `null` node = main node. */
const DESIGN_NODE_MAP: Record<string, [node: string | null, sub: 'class' | 'style']> = {
  class: [null, 'class'],
  input_class: [null, 'class'],
  element_class: [null, 'class'],
  style: [null, 'style'],
  label_class: ['label', 'class'],
  wrapper_class: ['wrapper', 'class'],
  group_class: ['group', 'class'],
  prepend_class: ['prepend', 'class'],
};

/** legacy lang-* keys → [CRUDUI lang sub-key, inverted?]. */
const LANG_KEY_MAP: Record<string, [sub: string, invert: boolean]> = {
  langs: ['only', false],
  lang_name: ['name', false],
  lang_key: ['key', false],
  lang_group_class: ['group_class', false],
  remove_lang_frame: ['frame', true],
  remove_lang_title: ['title', true],
};

/** legacy multiple-* keys → CRUDUI multiple sub-key. */
const MULTIPLE_KEY_MAP: Record<string, 'max' | 'copy' | 'sortable' | 'onclick'> = {
  multiple_max: 'max',
  multiple_copy: 'copy',
  add_buttons: 'copy',
  remove_list_button: 'copy',
  list_button_text: 'copy',
  sortable: 'sortable',
  sortable_button: 'sortable',
  multiple_button_onclick: 'onclick',
  sortable_onchange: 'onclick',
};

/** legacy dynamic items-source keys reclaimed under `items`. */
const ITEMS_SOURCE_KEYS = new Set(['model', 'method', 'table', 'relations']);

/** items-source keys that unambiguously mark a dynamic source (never an HTTP verb). */
const ITEMS_SOURCE_ANCHORS = new Set(['model', 'table', 'relations']);

/**
 * Whether a scattered items-source key is a real dynamic-source dependency on
 * THIS field. `model`/`table`/`relations` always are. A lone `method` is
 * ambiguous (Bug 6): a form/field-level `method` is an HTTP verb, NOT an items
 * source — it is only a source method when an anchor source key or an explicit
 * `items` rides alongside it.
 */
function isItemsSourceKey(key: string, legacy: LegacySpec): boolean {
  if (ITEMS_SOURCE_ANCHORS.has(key)) return true;
  if (key === 'method') {
    return (
      'items' in legacy ||
      Object.keys(legacy).some((k) => ITEMS_SOURCE_ANCHORS.has(k))
    );
  }
  return false;
}

/** legacy behavior keys → CRUDUI behavior sub-key. */
const BEHAVIOR_KEYS = new Set(['onchange', 'onclick', 'onload']);

/** Content keys whose value is text (G3) — a `null` here is empty content, dropped. */
const CONTENT_KEYS = new Set(['label', 'description', 'placeholder', 'prepend', 'append', 'help']);

/** legacy composition directives absorbed into $patch. */
const PATCH_DIRECTIVES = new Set(['$after', '$before', '$merge', '$change', '$remove']);

/** Parser-synthesized products that are not authored keys (dropped, no inverse). */
const SYNTHESIZED_DROP = new Set(['ready', 'seqtokey', '__13hex__']);

/** Whether a key is an x{key} comment (x + ≥1 char). */
function isXComment(key: string): boolean {
  return key.length > 1 && key.charCodeAt(0) === 0x78 /* 'x' */;
}

/**
 * Translate a legacy ROOT spec (a group with `properties`, or a bare properties map
 * entry) into CRUDUI. Returns the CRUDUI spec plus the irreversibility log.
 */
export function translateFromLegacy(legacy: LegacySpec): TranslateResult {
  const notes: TranslateNote[] = [];
  const schema = translateSpec(legacy, [], notes);
  return { schema, notes };
}

/**
 * Translate ONE legacy field spec → CRUDUI. Recurses into `properties` (which runs the
 * sibling-aware display pass). `path` is the dotted trace for notes.
 */
function translateSpec(legacy: LegacySpec, path: string[], notes: TranslateNote[]): SchemaSpec {
  const out: SchemaSpec = {};
  const validate: Record<string, unknown> = {};
  const design: Record<string, unknown> = {};
  const behavior: Record<string, unknown> = {};
  const options: Record<string, unknown> = {};
  const lang: Record<string, unknown> = {};
  const multiple: Record<string, unknown> = {};
  const patch: Record<string, unknown> = {};
  let multipleFlag: boolean | undefined;

  for (const key of Object.keys(legacy)) {
    const value = legacy[key];

    // x{key} comments — strip (irreversible: comment removal).
    if (isXComment(key)) {
      note(notes, path, key, 'XKEY_STRIP', `x-comment "${key}" stripped`);
      continue;
    }

    // Synthesized products — drop (no inverse).
    if (SYNTHESIZED_DROP.has(key)) {
      const reason: IrreversibleReason = 'SYNTHESIZED_PRODUCT';
      note(notes, path, key, reason, `synthesized product "${key}" dropped (G4 data-layer id / parser artifact)`);
      continue;
    }

    // -- passthrough first-class keys --
    if (PASSTHROUGH.has(key)) {
      // Bug 7: an empty content value (description:null, label:null, …) is the
      // same as the key being absent — drop the null key (no empty content node).
      if (value === null && CONTENT_KEYS.has(key)) {
        note(notes, path, key, 'CONTENT_NULL_DROP', `empty content "${key}:null" dropped (no empty content node)`);
        continue;
      }
      out[key] = value;
      continue;
    }

    // -- properties: recurse (sibling-aware display pass inside) --
    if (key === 'properties' && isObject(value)) {
      out.properties = translateProperties(value as LegacySpec, [...path, 'properties'], notes);
      continue;
    }
    // Bug: empty `properties:` (null / not a map) — a property-less group, NOT a
    // typeless options node. legacy `properties:` with no children parses to null and
    // would otherwise be swept into options:{properties:null} (type lost). Emit an
    // empty group: {type:'group', properties:{}} (the type injection below sets it).
    if (key === 'properties') {
      out.properties = {};
      note(notes, path, key, 'EMPTY_PROPERTIES_GROUP', `empty "properties:${value === null ? 'null' : typeof value}" normalized to an empty group {type:group, properties:{}}`);
      continue;
    }

    // -- $ref: passthrough --
    if (key === '$ref') {
      out.$ref = value;
      continue;
    }

    // -- legacy composition directives → $patch (irreversible) --
    if (PATCH_DIRECTIVES.has(key)) {
      absorbPatchDirective(key, value, patch, path, notes);
      continue;
    }
    if (key === '$patch' && isObject(value)) {
      // Bug 4: a $patch payload may carry nested legacy field specs whose legacy
      // keys (display_target, rules, class, …) would otherwise leak verbatim.
      // Recursively translate each patch value.
      for (const pk of Object.keys(value as Record<string, unknown>)) {
        patch[pk] = translatePatchValue((value as Record<string, unknown>)[pk], [...path, '$patch', pk], notes);
      }
      continue;
    }

    // -- rules → validate --
    if (key === 'rules' && isObject(value)) {
      const r = value as Record<string, unknown>;
      for (const rk of Object.keys(r)) {
        if (rk === 'messages') {
          note(notes, path, 'messages', 'MESSAGES_NO_SLOT', 'per-rule messages have no schema validate channel (gap, out of scope)');
          continue;
        }
        validate[rk] = r[rk];
      }
      continue;
    }
    // rules.messages may sit as a sibling `messages` block too.
    if (key === 'messages') {
      note(notes, path, 'messages', 'MESSAGES_NO_SLOT', 'per-rule/per-language messages have no schema slot (gap, out of scope)');
      continue;
    }

    // -- design appearance node map --
    if (key in DESIGN_NODE_MAP) {
      const [node, sub] = DESIGN_NODE_MAP[key];
      // Bug: class:null / style:null — Design.{class,style} is string|ConditionMap,
      // never null; an empty appearance value is the same as no appearance key,
      // so drop it (an emptied design slot is then pruned by attachSlot).
      if (value === null || isEmpty(value)) {
        note(notes, path, key, 'DESIGN_NULL_DROP', `empty appearance "${key}:${value === null ? 'null' : 'empty'}" dropped (Design.${sub} is string|ConditionMap, never null)`);
        continue;
      }
      setDesign(design, node, sub, value);
      continue;
    }

    // -- SPEC-unenumerated node classes (irreversible: node not named) --
    if (/_class$/.test(key) && /^(fieldset|button|append|header)_class$/.test(key)) {
      note(notes, path, key, 'NODE_NOT_ENUMERATED', `"${key}" targets a node the SPEC node map does not enumerate (out of scope)`);
      // Still carry the appearance into options so nothing is silently dropped.
      options[key] = value;
      continue;
    }

    // -- display: single target → design.show / design.class --
    if (key === 'display_target') {
      // Held until we see condition_style/_class/_condition; stash on a temp.
      design.__display_target = value;
      continue;
    }
    if (key === 'display_target_condition_style') {
      const targetPath = String((legacy.display_target as unknown) ?? '');
      design.show = styleConditionToShow(value, targetPath);
      continue;
    }
    if (key === 'display_target_condition_class') {
      // Bug 2: a null/non-map condition means "no class condition" — building a
      // {} map would clobber an already-set design.class (from class/input_class).
      // Skip the condition map entirely and preserve the original class.
      if (isObject(value)) {
        const targetPath = String((legacy.display_target as unknown) ?? '');
        design.class = classConditionToMap(value, targetPath);
      } else {
        note(notes, path, key, 'CONDITION_CLASS_NULL_DROP', `empty "${key}:${value === null ? 'null' : typeof value}" dropped — no class condition built, original design.class preserved`);
      }
      continue;
    }
    if (key === 'display_target_condition') {
      design.__display_target_condition = value;
      continue;
    }

    // -- plural display_targets* (irreversible fan-out): record + best-effort --
    if (key === 'display_targets' || key === 'display_targets_condition_style' || key === 'display_targets_condition') {
      note(notes, path, key, 'PLURAL_TARGETS_FANOUT', `plural "${key}" distributes one condition to many targets (fan-out, irreversible)`);
      continue;
    }

    // -- display_switch (source) handled by the sibling pass; never here.
    if (key === 'display_switch') {
      note(notes, path, 'display_switch', 'DISPLAY_SWITCH_ANNIHILATION', 'display_switch source key annihilated; effect distributed to target design.show');
      continue;
    }

    // -- behavior scripts --
    if (BEHAVIOR_KEYS.has(key)) {
      // Bug 5: a boolean flag (onload:true) is not a CRUDUI BehaviorAction
      // (string|{label,script}). `true` = "the action is on, no script" → drop
      // the flag (no opaque script to carry); `false` = off → drop. Real script
      // strings/objects pass through unchanged.
      if (typeof value === 'boolean') {
        note(notes, path, key, 'BEHAVIOR_FLAG_NORMALIZE', `boolean behavior flag "${key}:${value}" dropped (schema BehaviorAction is string|{label,script}, not a flag)`);
        continue;
      }
      behavior[key] = value;
      continue;
    }

    // -- lang dimension --
    if (key === 'lang') {
      // legacy `lang: append` (mode) or `lang: true`.
      if (typeof value === 'string') lang.mode = value;
      else if (value === true) {
        // bare on — represented by lang:true below if no settings accrue.
        lang.__bare = true;
      } else if (isObject(value)) {
        Object.assign(lang, value as Record<string, unknown>);
      }
      continue;
    }
    if (key in LANG_KEY_MAP) {
      const [sub, invert] = LANG_KEY_MAP[key];
      // `langs` → `only`: a string[] allowlist stays verbatim, but a per-language
      // override map ({ja: {rules…}}) must have each language's slot overrides
      // recursively translated (rules→validate, class→design, …) like a field.
      if (sub === 'only' && isObject(value)) {
        const overrides: Record<string, unknown> = {};
        for (const [langCode, langSpec] of Object.entries(value)) {
          overrides[langCode] = isObject(langSpec)
            ? translateSpec(langSpec as LegacySpec, [...path, 'lang', 'only', langCode], notes)
            : langSpec;
        }
        lang[sub] = overrides;
      } else {
        lang[sub] = invert ? !value : value;
      }
      continue;
    }

    // -- multiple dimension --
    if (key === 'multiple') {
      if (value === 'only') {
        multipleFlag = true; // fold only → true (irreversible)
        note(notes, path, 'multiple:only', 'MULTIPLE_ONLY_FOLD', 'multiple:only folded into multiple:true (mode lost)');
      } else if (value === true) {
        multipleFlag = true;
      } else if (isObject(value)) {
        Object.assign(multiple, value as Record<string, unknown>);
      }
      continue;
    }
    if (key in MULTIPLE_KEY_MAP) {
      const sub = MULTIPLE_KEY_MAP[key];
      if (sub === 'copy') multiple.copy = true; // any of the button keys → copy:true
      else if (sub === 'sortable') multiple.sortable = true;
      else multiple[sub] = value;
      continue;
    }

    // -- items (static or dynamic source) --
    if (key === 'items') {
      // Bug: items:null / empty items — Items is array|source|label-map, never
      // null and never the empty {} that a fully-commented-out legacy `items:` block
      // parses to. An empty items carries no membership, so it is the same as the
      // key being absent — drop it (mirrors the content-null drop).
      if (value === null || isEmpty(value)) {
        note(notes, path, key, 'ITEMS_NULL_DROP', `empty "items:${value === null ? 'null' : 'empty'}" dropped (Items is array|source|label-map, never null)`);
        continue;
      }
      out.items = normalizeItems(value, [...path, 'items'], notes);
      continue;
    }
    if (ITEMS_SOURCE_KEYS.has(key) && isItemsSourceKey(key, legacy)) {
      // A scattered dynamic-source key → reclaim under items.
      if (!isObject(out.items)) out.items = {};
      (out.items as Record<string, unknown>)[key] = value;
      continue;
    }

    // -- everything else: type-dependent → options (open bucket) --
    options[key] = value;
  }

  // Resolve held display_target (+condition) when no _style/_class consumed it.
  finalizeDisplayTarget(design, path, notes);

  // Attach accumulated slots/buckets (omit empties — keeps output minimal & clean).
  attachSlot(out, 'validate', validate);
  attachSlot(out, 'design', design);
  attachSlot(out, 'behavior', behavior);
  attachSlot(out, 'options', options);
  attachLang(out, lang);
  attachMultiple(out, multiple, multipleFlag);
  if (Object.keys(patch).length > 0) out.$patch = patch;

  // Bug 1: a node that has `properties` but no `type` is a group — inject
  // `type:'group'` so the output satisfies Field.required=['type']. The schema
  // forbids a property-bearing field without a type. The injection ADDS a key
  // absent in legacy, so the node falls outside the bit-identity round-trip gate.
  if (out.type === undefined && isObject(out.properties)) {
    out.type = 'group';
    note(notes, path, 'type', 'TYPE_GROUP_INJECTED', 'properties present without type — type:group injected (Field.required=[type]); adds a key absent in legacy');
  }

  return out;
}

/**
 * Translate a legacy `properties` MAP. Runs the sibling-aware display_switch pass
 * FIRST (distributing each source's switch onto target fields' design.show),
 * then per-field translation. `$ref`/`$patch` directives inside the map are
 * carried/absorbed.
 */
function translateProperties(props: LegacySpec, path: string[], notes: TranslateNote[]): SchemaSpec {
  // Pass A: collect display_switch distributions { targetField: showConditionMap }.
  const distributed = collectDisplaySwitch(props, path, notes);

  const out: SchemaSpec = {};
  for (const fieldName of Object.keys(props)) {
    const child = props[fieldName];

    // Bug 3: an x{key} FIELD NAME (xbanners[], xnote, …) is an x-comment field —
    // strip the whole field, exactly as an x-comment VALUE key is stripped.
    if (isXComment(fieldName)) {
      note(notes, path, fieldName, 'XKEY_STRIP', `x-comment field "${fieldName}" stripped`);
      continue;
    }

    // Map-level composition directives.
    if (fieldName === '$ref') {
      out.$ref = child;
      continue;
    }
    if (fieldName === '$patch' && isObject(child)) {
      // Bug 4: recursively translate nested legacy field specs inside the patch.
      const patch: Record<string, unknown> = {};
      for (const pk of Object.keys(child as Record<string, unknown>)) {
        patch[pk] = translatePatchValue((child as Record<string, unknown>)[pk], [...path, '$patch', pk], notes);
      }
      out.$patch = patch;
      continue;
    }
    if (PATCH_DIRECTIVES.has(fieldName)) {
      const patch: Record<string, unknown> = isObject(out.$patch) ? (out.$patch as Record<string, unknown>) : {};
      absorbPatchDirective(fieldName, child, patch, path, notes);
      out.$patch = patch;
      continue;
    }

    if (!isObject(child)) {
      // Non-spec leaf (e.g. a scalar default map) — carry verbatim.
      out[fieldName] = child;
      continue;
    }

    const schemaChild = translateSpec(child as LegacySpec, [...path, fieldName], notes);

    // Bug: a reserved key (items/table) used as a field NAME is a normal field
    // spec, not a dynamic-source/choice construct (reserved-key handling fires
    // only on a field's OWN keys, never on a field name). When such a field — or
    // any field at a properties position — carries content but lacks a `type`
    // (e.g. Stepper `items:{1:기본,…}`, Excel `table:{5:{…}}` whose value-map
    // body lands in options), inject `type:'group'` so the node satisfies
    // Field.required=[type]. A $patch-only or $ref-only residue node is left as is.
    if (
      schemaChild.type === undefined &&
      schemaChild.$ref === undefined &&
      schemaChild.$patch === undefined &&
      schemaChild.properties === undefined &&
      Object.keys(schemaChild).length > 0
    ) {
      schemaChild.type = 'group';
      note(notes, [...path, fieldName], 'type', 'TYPE_GROUP_INJECTED', 'field-position node without type — type:group injected (Field.required=[type]); adds a key absent in legacy');
    }

    // Inject any distributed design.show for this target field.
    const inject = distributed[fieldName];
    if (inject) {
      const design = isObject(schemaChild.design) ? (schemaChild.design as Record<string, unknown>) : {};
      design.show = inject;
      schemaChild.design = design;
    }
    out[fieldName] = schemaChild;
  }
  return out;
}

/**
 * Pass A: scan the properties map for `display_switch` sources and build the
 * per-target design.show condition maps (the annihilation). A source field
 * `S.display_switch = { val: [t1, t2], val2: [t3] }` produces, for each target
 * `t`, a condition map `{ '.S==val': true, true: false }`. Irreversible.
 */
function collectDisplaySwitch(
  props: LegacySpec,
  path: string[],
  notes: TranslateNote[]
): Record<string, Record<string, boolean>> {
  const distributed: Record<string, Record<string, boolean>> = {};
  for (const sourceName of Object.keys(props)) {
    const source = props[sourceName];
    if (!isObject(source)) continue;
    const sw = (source as Record<string, unknown>).display_switch;
    if (!isObject(sw)) continue;

    note(
      notes,
      [...path, sourceName],
      'display_switch',
      'DISPLAY_SWITCH_ANNIHILATION',
      `display_switch on "${sourceName}" distributed to target design.show (synthesized JS / uniqueClassId / ready annihilated)`
    );

    const switchMap = sw as Record<string, unknown>;
    for (const switchVal of Object.keys(switchMap)) {
      const targets = switchMap[switchVal];
      const targetList = Array.isArray(targets) ? targets : [targets];
      for (const t of targetList) {
        const targetName = String(t).replace(/^\./, ''); // ".company_name" → "company_name"
        const cond = `.${sourceName}==${quoteIfNeeded(switchVal)}`;
        distributed[targetName] = { [cond]: true, true: false };
      }
    }
  }
  return distributed;
}

/**
 * legacy `display_target_condition_style` ({0:'display:none',1:'display:block'}) →
 * CRUDUI `design.show` boolean condition map. Normalizes the style channel to a
 * visibility boolean: `display:none` → false, anything else → true. Irreversible
 * (style strings are lost), but visibility semantics are preserved. The target
 * path threads the source value: `.<target>==<val>`.
 */
function styleConditionToShow(value: unknown, targetPath: string): Record<string, boolean> {
  const target = targetPath.replace(/^\./, '');
  const out: Record<string, boolean> = {};
  if (isObject(value)) {
    const m = value as Record<string, unknown>;
    for (const v of Object.keys(m)) {
      const style = String(m[v]).replace(/\s+/g, '').toLowerCase();
      const shown = !style.includes('display:none');
      // The branch where the target equals this value yields visibility `shown`.
      out[`.${target}==${quoteIfNeeded(v)}`] = shown;
    }
  }
  out.true = false; // default: hidden unless a branch matched.
  return out;
}

/**
 * legacy `display_target_condition_class` ({val:'cls'}) → CRUDUI `design.class`
 * condition map keyed by the target value.
 */
function classConditionToMap(value: unknown, targetPath: string): Record<string, unknown> {
  const target = targetPath.replace(/^\./, '');
  const out: Record<string, unknown> = {};
  if (isObject(value)) {
    const m = value as Record<string, unknown>;
    for (const v of Object.keys(m)) {
      out[`.${target}==${quoteIfNeeded(v)}`] = m[v];
    }
  }
  return out;
}

/** Resolve a held display_target / display_target_condition into design.show. */
function finalizeDisplayTarget(design: Record<string, unknown>, _path: string[], _notes: TranslateNote[]): void {
  const target = design.__display_target;
  const cond = design.__display_target_condition;
  delete design.__display_target;
  delete design.__display_target_condition;
  if (target === undefined) return;
  // If a condition expression was given, the show condition is that expression.
  if (cond !== undefined && design.show === undefined) {
    design.show = cond;
  } else if (design.show === undefined) {
    // Bare display_target with no style/class/condition → show depends on the path being truthy.
    design.show = String(target);
  }
}

/** Absorb a legacy composition directive into the $patch object (irreversible). */
function absorbPatchDirective(
  key: string,
  value: unknown,
  patch: Record<string, unknown>,
  path: string[],
  notes: TranslateNote[]
): void {
  note(notes, path, key, 'PATCH_ABSORPTION', `legacy "${key}" absorbed into $patch (position/op identity lost)`);
  if (key === '$remove') {
    const existing = Array.isArray(patch.remove) ? (patch.remove as unknown[]) : [];
    if (Array.isArray(value)) patch.remove = [...existing, ...value];
    else if (isObject(value)) {
      // nested-map remove → flatten to deep paths.
      patch.remove = [...existing, ...flattenRemovePaths(value as Record<string, unknown>, [])];
    } else patch.remove = [...existing, value];
    return;
  }
  // $after/$before/$merge/$change → add/replace via deep-path set.
  // Bug 4: a directive payload may carry nested legacy field specs whose legacy keys
  // would leak verbatim — recursively translate each value.
  if (isObject(value)) {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      patch[k] = translatePatchValue((value as Record<string, unknown>)[k], [...path, key, k], notes);
    }
  }
}

/**
 * Translate ONE $patch payload value (Bug 4). A patch value that is a legacy
 * field-spec object (carries a translator-recognized legacy key — display_target,
 * rules, class, properties, …) is recursively translated so no legacy/forbidden
 * key leaks verbatim into the canonical $patch. A scalar, array, or plain data
 * map (e.g. a {ko,en} content map, a deep-path string value) is carried as-is.
 */
function translatePatchValue(value: unknown, path: string[], notes: TranslateNote[]): unknown {
  if (Array.isArray(value)) {
    return value.map((el, i) => translatePatchValue(el, [...path, String(i)], notes));
  }
  if (!isObject(value)) return value;
  if (looksLikeLegacyFieldSpec(value)) {
    return translateSpec(value as LegacySpec, path, notes);
  }
  // Plain data map — recurse into values (a nested field spec may hide deeper),
  // but keep the object's own (non-spec) keys.
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    out[k] = translatePatchValue((value as Record<string, unknown>)[k], [...path, k], notes);
  }
  return out;
}

/**
 * Whether an object is a legacy field spec (vs. a plain data/content map). True when
 * it carries any key the translator recognizes and rewrites — a structural key,
 * a role key, or a legacy/forbidden meta key. A content map ({ko,en}) or a
 * deep-path value map carries none, so it is left verbatim.
 */
function looksLikeLegacyFieldSpec(obj: Record<string, unknown>): boolean {
  for (const k of Object.keys(obj)) {
    if (
      PASSTHROUGH.has(k) ||
      k === 'properties' ||
      k === 'rules' ||
      k === 'items' ||
      k === 'lang' ||
      k === 'multiple' ||
      k === 'display_switch' ||
      k.startsWith('display_target') ||
      k === 'display_targets' ||
      BEHAVIOR_KEYS.has(k) ||
      k in DESIGN_NODE_MAP ||
      k in LANG_KEY_MAP ||
      k in MULTIPLE_KEY_MAP ||
      PATCH_DIRECTIVES.has(k) ||
      isXComment(k)
    ) {
      return true;
    }
  }
  return false;
}

/** Flatten a nested $remove map {a:{b:1}} into deep paths ['a.b']. */
function flattenRemovePaths(obj: Record<string, unknown>, prefix: string[]): string[] {
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const next = [...prefix, k];
    if (isObject(v) && Object.keys(v as Record<string, unknown>).length > 0) {
      out.push(...flattenRemovePaths(v as Record<string, unknown>, next));
    } else {
      out.push(next.join('.'));
    }
  }
  return out;
}

/** Set design[node][sub] = value, or design[sub] = value when node is the main node. */
function setDesign(
  design: Record<string, unknown>,
  node: string | null,
  sub: 'class' | 'style',
  value: unknown
): void {
  if (node === null) {
    // Merge into the main node, preserving an already-set class (input_class + class).
    if (sub === 'class' && typeof design.class === 'string' && typeof value === 'string' && design.class !== value) {
      design.class = `${design.class} ${value}`;
    } else {
      design[sub] = value;
    }
    return;
  }
  const nodeObj = isObject(design[node]) ? (design[node] as Record<string, unknown>) : {};
  nodeObj[sub] = value;
  design[node] = nodeObj;
}

/** Attach a slot object only if non-empty (after pruning temp keys). */
function attachSlot(out: SchemaSpec, name: string, slot: Record<string, unknown>): void {
  for (const k of Object.keys(slot)) {
    if (k.startsWith('__')) delete slot[k];
  }
  if (Object.keys(slot).length > 0) out[name] = slot;
}

/** Attach lang: `{__bare:true}` alone → `lang:true`; otherwise the settings object. */
function attachLang(out: SchemaSpec, lang: Record<string, unknown>): void {
  const bare = lang.__bare === true;
  delete lang.__bare;
  if (Object.keys(lang).length > 0) out.lang = lang;
  else if (bare) out.lang = true;
}

/** Attach multiple: settings object wins; else the bare boolean flag. */
function attachMultiple(out: SchemaSpec, multiple: Record<string, unknown>, flag: boolean | undefined): void {
  if (Object.keys(multiple).length > 0) {
    if (flag === true && multiple.max === undefined && multiple.copy === undefined && multiple.sortable === undefined && multiple.onclick === undefined) {
      // flag plus only foreign keys — keep object.
    }
    out.multiple = multiple;
  } else if (flag === true) {
    out.multiple = true;
  }
}

/** Quote a condition value when it is non-numeric (string equality needs quotes). */
function quoteIfNeeded(v: string): string {
  return /^-?\d+(\.\d+)?$/.test(v) ? v : `'${v}'`;
}

/** Whether a value is an empty object {} or empty array [] (no members). */
function isEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false;
}

/**
 * Normalize a static items value→label map (G3). A non-string, non-object,
 * non-null label (a number like `404`) is stringified — ItemLabel is
 * string|LangMap|null, never a number. Arrays and dynamic-source objects pass
 * through; only a plain value→label MAP is normalized.
 */
function normalizeItems(value: unknown, path: string[], notes: TranslateNote[]): unknown {
  if (!isObject(value)) return value;
  const m = value as Record<string, unknown>;
  // A dynamic source ({model,method,table,relations}) is not a label map.
  if (Object.keys(m).every((k) => ITEMS_SOURCE_KEYS.has(k))) return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(m)) {
    const label = m[k];
    if (typeof label === 'number' || typeof label === 'boolean') {
      out[k] = String(label);
      note(notes, path, k, 'ITEM_LABEL_STRINGIFY', `item label "${k}:${label}" stringified to "${String(label)}" (ItemLabel is string|LangMap|null, never a ${typeof label})`);
    } else {
      out[k] = label;
    }
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function note(
  notes: TranslateNote[],
  path: string[],
  legacyKey: string,
  reason: IrreversibleReason,
  detail: string
): void {
  // Single truth: the reason must be one KEY_MAPPINGS marks irreversible. The
  // translator consults the table here — an unregistered reason is a wiring bug.
  if (!IRREVERSIBLE_REASONS.has(reason)) {
    throw new Error(
      `translator emitted reason "${reason}" not declared reversible:false in KEY_MAPPINGS (single-truth violation) at ${path.join('.')}`
    );
  }
  notes.push({ path: path.join('.'), legacyKey, reason, detail });
}
