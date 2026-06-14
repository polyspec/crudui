/**
 * legacy→CRUDUI translator — shared types and the key-mapping table (single truth).
 *
 * The translator is a pure SPEC→SPEC transform (CRUDUI-NEW, R7 parallel run): it
 * reads a legacy field spec object and emits a CRUDUI field spec object. It never touches
 * the legacy model/loader/parser and never runs `eval` — it rewrites keys only.
 *
 * This file mechanizes the analysis `key_mappings`/`roundtrip_rule` verbatim:
 * every legacy key the translator recognizes is listed once here, tagged reversible
 * or not. Reversibility is the SINGLE GATE the round-trip test reads — a key the
 * table marks `reversible:false` is a legacy-transcending (R7) absorption and is
 * excluded from the legacy→CRUDUI→legacy bit-identity guarantee, with the reason recorded.
 *
 * Nothing here widens the CRUDUI model: the OUTPUT is a `FieldSpec` shape that the
 * CRUDUI meta-schema accepts and the forbidden-scan passes (zero meta keys). The
 * translator is the only place legacy names are RECOGNIZED — the schema never
 * recognizes them (R2/R4).
 */

/** A legacy spec object (untyped legacy shape — keys are absorbed, not modeled). */
export type LegacySpec = Record<string, unknown>;

/** A CRUDUI spec object (the canonical shape; see ../types.ts FieldSpec). */
export type SchemaSpec = Record<string, unknown>;

/**
 * Why a legacy key is NOT round-trippable. Each value is an R7 legacy-transcend
 * reason taken from the analysis `irreversible_notes` — the translator records
 * it so the round-trip gate can EXCLUDE the key and explain the exclusion rather
 * than silently dropping the guarantee.
 */
export type IrreversibleReason =
  /** display_switch synthesis (uniqueClassId + onchange JS + ready) is annihilated into target design.show — no inverse. */
  | 'DISPLAY_SWITCH_ANNIHILATION'
  /** style-based display (display:none/block) normalized to a design.show boolean — arbitrary style strings are lost. */
  | 'STYLE_DISPLAY_LOSSY'
  /** plural display_targets distributes one condition to many targets — the grouping is not recoverable. */
  | 'PLURAL_TARGETS_FANOUT'
  /** $after/$before/$merge/$change/$remove absorbed into $patch — relative position / op identity is lost. */
  | 'PATCH_ABSORPTION'
  /** x{key} comment strip — x-prefixed comments cannot survive into the canonical spec. */
  | 'XKEY_STRIP'
  /** multiple:only folded into multiple:true (+ [] name normalization) — the `only` mode is gone. */
  | 'MULTIPLE_ONLY_FOLD'
  /** lang:append's synthesized *_langs groups are reclaimed into the lang dimension — synthesis is not a written key. */
  | 'LANGS_GROUP_SYNTHESIS'
  /** parser-synthesized products (ready / seqtokey / __13hex__): never authored legacy keys, so no inverse target. */
  | 'SYNTHESIZED_PRODUCT'
  /** messages (per-rule per-language) has NO CRUDUI slot — out of translator scope, reported as a gap (no new decision). */
  | 'MESSAGES_NO_SLOT'
  /** SPEC node map does not enumerate this node (fieldset/button/append/header) — naming is out of scope (no new decision). */
  | 'NODE_NOT_ENUMERATED'
  /** empty content (label/description/…:null) dropped — an empty content node is the same as no key, so it carries nothing to reverse. */
  | 'CONTENT_NULL_DROP'
  /** boolean behavior flag (onchange/onclick/onload:true|false) dropped — CRUDUI BehaviorAction is string|{label,script}, never a bare flag, so there is no script to carry. */
  | 'BEHAVIOR_FLAG_NORMALIZE'
  /** type:group injected on a property-bearing node that lacked a type — adds a key absent in legacy (Field.required=[type]), so bit-identity does not hold. */
  | 'TYPE_GROUP_INJECTED'
  /** display_target_condition_class:null (empty) dropped — no class condition is built and the original design.class is preserved, so the null key has no inverse. */
  | 'CONDITION_CLASS_NULL_DROP'
  /** items:null / empty items dropped — Items is array|source|label-map, never null; an empty items key carries no membership, so it is the same as no key. */
  | 'ITEMS_NULL_DROP'
  /** design.{class,style}:null dropped — Design.class/style is string|ConditionMap, never null; an empty appearance key is the same as no key (and an emptied design slot is removed). */
  | 'DESIGN_NULL_DROP'
  /** empty properties:null normalized to {type:group, properties:{}} — an empty group, not a typeless options node; the empty map adds no field. */
  | 'EMPTY_PROPERTIES_GROUP'
  /** numeric/non-string item label normalized to a string (G3 content) — ItemLabel is string|LangMap|null, never a number. */
  | 'ITEM_LABEL_STRINGIFY';

/**
 * The full translator key table — every legacy key family the analysis lists,
 * tagged with reversibility and (when irreversible) the R7 reason. This is the
 * documentation/tooling surface; the actual rewrite logic in `from-legacy.ts` /
 * `to-legacy.ts` consults these flags. Order follows the analysis `key_mappings`.
 */
export interface KeyMapping {
  /** The legacy key family (or a short label for distributed/plural families). */
  legacy: string;
  /** Where it lands in the CRUDUI model. */
  schema: string;
  /** Whether legacy→CRUDUI→legacy restores the original bit-for-bit for this key. */
  reversible: boolean;
  /** When `reversible:false`, the R7 reason; absent when reversible. */
  reason?: IrreversibleReason;
}

/**
 * The canonical key-mapping table (single truth, mechanized from the analysis).
 * The round-trip gate splits cases by `reversible` here; the meta-schema/
 * forbidden-scan validate the OUTPUT shape independently.
 */
export const KEY_MAPPINGS: readonly KeyMapping[] = [
  // -- display (condition → value, G1/G-A/G-D) --
  { legacy: 'display_switch', schema: 'target design.show condition maps (annihilation)', reversible: false, reason: 'DISPLAY_SWITCH_ANNIHILATION' },
  { legacy: 'display_target', schema: 'design.show path', reversible: true },
  { legacy: 'display_target_condition_style', schema: 'design.show boolean condition map', reversible: true },
  { legacy: 'display_target_condition_class', schema: 'design.class condition map', reversible: true },
  { legacy: 'display_target_condition_class: null (empty)', schema: '— dropped (no condition built; original design.class preserved)', reversible: false, reason: 'CONDITION_CLASS_NULL_DROP' },
  { legacy: 'display_target_condition', schema: 'design.show / design.class condition expression', reversible: true },
  { legacy: 'display_targets (+_condition_style/_condition)', schema: 'each listed target design.show (fan-out)', reversible: false, reason: 'PLURAL_TARGETS_FANOUT' },

  // -- validate (rules → validate) --
  { legacy: 'rules', schema: 'validate slot', reversible: true },
  { legacy: 'rules.required', schema: 'validate.required (Evaluated<boolean>)', reversible: true },
  { legacy: 'rules.match', schema: 'validate.match', reversible: true },
  { legacy: 'rules.email', schema: 'validate.email', reversible: true },
  { legacy: 'rules.{minlength,maxlength,min,max,accept,unique,maxTo,notEqual,equalTo,…}', schema: 'validate.{rule} (index signature)', reversible: true },
  { legacy: 'messages', schema: '— no schema slot (gap, out of scope)', reversible: false, reason: 'MESSAGES_NO_SLOT' },

  // -- design (appearance node map) --
  { legacy: 'class / input_class', schema: 'design.class', reversible: true },
  { legacy: 'style', schema: 'design.style', reversible: true },
  { legacy: 'label_class', schema: 'design.label.class', reversible: true },
  { legacy: 'wrapper_class', schema: 'design.wrapper.class', reversible: true },
  { legacy: 'group_class', schema: 'design.group.class', reversible: true },
  { legacy: 'prepend_class', schema: 'design.prepend.class', reversible: true },
  { legacy: 'element_class', schema: 'design.class', reversible: true },
  { legacy: 'fieldset_class / button_class / append_class / header_class', schema: 'design.{node}.class — node NOT enumerated', reversible: false, reason: 'NODE_NOT_ENUMERATED' },

  // -- behavior (opaque scripts) --
  { legacy: 'onchange / onclick / onload (script)', schema: 'behavior.onchange / .onclick / .onload', reversible: true },
  { legacy: 'onchange / onclick / onload (boolean flag)', schema: '— dropped (BehaviorAction is string|{label,script}, not a flag)', reversible: false, reason: 'BEHAVIOR_FLAG_NORMALIZE' },
  { legacy: 'ready', schema: '— synthesized product (no inverse)', reversible: false, reason: 'SYNTHESIZED_PRODUCT' },

  // -- lang dimension --
  { legacy: 'lang: append', schema: 'lang.mode: append', reversible: true },
  { legacy: 'langs', schema: 'lang.only', reversible: true },
  { legacy: 'lang_name', schema: 'lang.name', reversible: true },
  { legacy: 'lang_key', schema: 'lang.key', reversible: true },
  { legacy: 'remove_lang_frame', schema: 'lang.frame (boolean inversion)', reversible: true },
  { legacy: 'remove_lang_title', schema: 'lang.title (inversion)', reversible: true },
  { legacy: 'lang_group_class', schema: 'lang.group_class', reversible: true },
  { legacy: '*_langs synthesized group', schema: 'lang bucket (reclaimed)', reversible: false, reason: 'LANGS_GROUP_SYNTHESIS' },

  // -- multiple dimension --
  { legacy: 'multiple: true', schema: 'multiple: true', reversible: true },
  { legacy: 'multiple: only', schema: 'multiple: true (+ [] name normalization)', reversible: false, reason: 'MULTIPLE_ONLY_FOLD' },
  { legacy: 'multiple_max', schema: 'multiple.max', reversible: true },
  { legacy: 'sortable / sortable_button / sortable_onchange', schema: 'multiple.sortable (+ onclick)', reversible: true },
  { legacy: 'add_buttons / remove_list_button / list_button_text / multiple_copy', schema: 'multiple.copy', reversible: true },
  { legacy: 'multiple_button_onclick', schema: 'multiple.onclick', reversible: true },

  // -- composition --
  { legacy: '$ref', schema: '$ref', reversible: true },
  { legacy: '$after / $before', schema: '$patch (add; position absorbed)', reversible: false, reason: 'PATCH_ABSORPTION' },
  { legacy: '$merge / $change', schema: '$patch (deep merge/replace)', reversible: false, reason: 'PATCH_ABSORPTION' },
  { legacy: '$remove', schema: '$patch (remove)', reversible: false, reason: 'PATCH_ABSORPTION' },

  // -- items (static + dynamic source) --
  { legacy: 'items (static map/array)', schema: 'items (polymorphic)', reversible: true },
  { legacy: 'items dynamic source (model/method/table/relations)', schema: 'items.{model,method,table,relations}', reversible: true },

  // -- options (type-dependent open bucket) --
  { legacy: 'type-dependent keys (readonly/value/href/accept/rows/width/height/…)', schema: 'options.{key}', reversible: true },
  { legacy: 'container chrome (collapse/expend/view_total/stepper/blank_message)', schema: 'options.{key}', reversible: true },
  { legacy: 'type-dependent scripts/callbacks (callback/event)', schema: 'options.callback / options.event', reversible: true },

  // -- comment strip / encoding products --
  { legacy: 'x{key} (xclass/xstyle/x…)', schema: '— removed (comment strip)', reversible: false, reason: 'XKEY_STRIP' },
  { legacy: 'seqtokey / __13hex__', schema: '— data-layer hidden id (G4)', reversible: false, reason: 'SYNTHESIZED_PRODUCT' },

  // -- first-class passthrough --
  { legacy: 'label / description / placeholder / prepend / append / help / name / type / default / properties', schema: 'same first-class key (passthrough)', reversible: true },
  { legacy: 'label / description / … : null (empty content)', schema: '— dropped (empty content node = absent key)', reversible: false, reason: 'CONTENT_NULL_DROP' },

  // -- structure inference --
  { legacy: 'properties present, type absent', schema: 'type: group (injected — Field.required=[type])', reversible: false, reason: 'TYPE_GROUP_INJECTED' },

  // -- items dynamic source vs HTTP verb --
  { legacy: 'method (lone, no model/table/relations/items sibling)', schema: 'options.method (form/field HTTP verb, NOT items source)', reversible: true },
];

/** Result of translating a single legacy spec tree into CRUDUI, with a translation log. */
export interface TranslateResult {
  /** The translated CRUDUI spec (meta-schema-clean, zero meta keys). */
  schema: SchemaSpec;
  /**
   * One note per irreversible absorption that fired during translation, so a
   * round-trip gate can exclude the affected field and surface WHY (R7). A field
   * whose log is empty is in the reversible set.
   */
  notes: TranslateNote[];
}

/** A single irreversible-absorption note recorded during translation. */
export interface TranslateNote {
  /** Dotted path to the field that triggered the absorption. */
  path: string;
  /** The legacy key family that triggered it. */
  legacyKey: string;
  /** The R7 reason it cannot round-trip. */
  reason: IrreversibleReason;
  /** Human-readable detail. */
  detail: string;
}
