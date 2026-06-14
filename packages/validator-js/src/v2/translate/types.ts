/**
 * v1→v2 translator — shared types and the key-mapping table (single truth).
 *
 * The translator is a pure SPEC→SPEC transform (v2-NEW, R7 parallel run): it
 * reads a v1 field spec object and emits a v2 field spec object. It never touches
 * the v1 model/loader/parser and never runs `eval` — it rewrites keys only.
 *
 * This file mechanizes the analysis `key_mappings`/`roundtrip_rule` verbatim:
 * every v1 key the translator recognizes is listed once here, tagged reversible
 * or not. Reversibility is the SINGLE GATE the round-trip test reads — a key the
 * table marks `reversible:false` is a legacy-transcending (R7) absorption and is
 * excluded from the v1→v2→v1 bit-identity guarantee, with the reason recorded.
 *
 * Nothing here widens the v2 model: the OUTPUT is a `FieldSpecV2` shape that the
 * v2 meta-schema accepts and the forbidden-scan passes (zero meta keys). The
 * translator is the only place legacy names are RECOGNIZED — the schema never
 * recognizes them (R2/R4).
 */

/** A v1 spec object (untyped legacy shape — keys are absorbed, not modeled). */
export type V1Spec = Record<string, unknown>;

/** A v2 spec object (the canonical shape; see ../types.ts FieldSpecV2). */
export type V2Spec = Record<string, unknown>;

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
  /** parser-synthesized products (ready / seqtokey / __13hex__): never authored v1 keys, so no inverse target. */
  | 'SYNTHESIZED_PRODUCT'
  /** messages (per-rule per-language) has NO v2 slot — out of translator scope, reported as a gap (no new decision). */
  | 'MESSAGES_NO_SLOT'
  /** SPEC node map does not enumerate this node (fieldset/button/append/header) — naming is out of scope (no new decision). */
  | 'NODE_NOT_ENUMERATED'
  /** empty content (label/description/…:null) dropped — an empty content node is the same as no key, so it carries nothing to reverse. */
  | 'CONTENT_NULL_DROP'
  /** boolean behavior flag (onchange/onclick/onload:true|false) dropped — v2 BehaviorAction is string|{label,script}, never a bare flag, so there is no script to carry. */
  | 'BEHAVIOR_FLAG_NORMALIZE'
  /** type:group injected on a property-bearing node that lacked a type — adds a key absent in v1 (Field.required=[type]), so bit-identity does not hold. */
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
 * tagged with reversibility and (when irreversible) the R7 reason. Order follows
 * the analysis `key_mappings`.
 *
 * What ACTUALLY consumes this table (single truth, no over-claim):
 *   - `v1tov2.ts` consults it as the authoritative R7-reason registry: every
 *     reason the forward translator records (`note()`) must be a row the table
 *     marks `reversible:false` — an unregistered reason throws.
 *   - the round-trip gate (`index.ts roundtripV1`) splits cases by whether the
 *     forward pass logged any such reason (reversible = empty note log).
 *   - `translate.unit.test.ts` asserts table integrity (every irreversible row
 *     carries a reason, every reversible row omits it).
 *
 * What does NOT read it: the per-key REWRITE/INVERSE logic in `v1tov2.ts` /
 * `v2tov1.ts` is driven by value-and-context-dependent maps (DESIGN_NODE_MAP,
 * LANG_KEY_MAP, …), not by the table's human-label `v1` column — the table is
 * the reason vocabulary, not the rewrite dispatch.
 */
export interface KeyMapping {
  /** The legacy key family (or a short label for distributed/plural families). */
  v1: string;
  /** Where it lands in the v2 model. */
  v2: string;
  /** Whether v1→v2→v1 restores the original bit-for-bit for this key. */
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
  { v1: 'display_switch', v2: 'target design.show condition maps (annihilation)', reversible: false, reason: 'DISPLAY_SWITCH_ANNIHILATION' },
  { v1: 'display_target', v2: 'design.show path', reversible: true },
  { v1: 'display_target_condition_style', v2: 'design.show boolean condition map', reversible: true },
  { v1: 'display_target_condition_class', v2: 'design.class condition map', reversible: true },
  { v1: 'display_target_condition_class: null (empty)', v2: '— dropped (no condition built; original design.class preserved)', reversible: false, reason: 'CONDITION_CLASS_NULL_DROP' },
  { v1: 'display_target_condition', v2: 'design.show / design.class condition expression', reversible: true },
  { v1: 'display_targets (+_condition_style/_condition)', v2: 'each listed target design.show (fan-out)', reversible: false, reason: 'PLURAL_TARGETS_FANOUT' },

  // -- validate (rules → validate) --
  { v1: 'rules', v2: 'validate slot', reversible: true },
  { v1: 'rules.required', v2: 'validate.required (Evaluated<boolean>)', reversible: true },
  { v1: 'rules.match', v2: 'validate.match', reversible: true },
  { v1: 'rules.email', v2: 'validate.email', reversible: true },
  { v1: 'rules.{minlength,maxlength,min,max,accept,unique,maxTo,notEqual,equalTo,…}', v2: 'validate.{rule} (index signature)', reversible: true },
  { v1: 'messages', v2: '— no v2 slot (gap, out of scope)', reversible: false, reason: 'MESSAGES_NO_SLOT' },

  // -- design (appearance node map) --
  { v1: 'class / input_class', v2: 'design.class', reversible: true },
  { v1: 'style', v2: 'design.style', reversible: true },
  { v1: 'label_class', v2: 'design.label.class', reversible: true },
  { v1: 'wrapper_class', v2: 'design.wrapper.class', reversible: true },
  { v1: 'group_class', v2: 'design.group.class', reversible: true },
  { v1: 'prepend_class', v2: 'design.prepend.class', reversible: true },
  { v1: 'element_class', v2: 'design.class', reversible: true },
  { v1: 'fieldset_class / button_class / append_class / header_class', v2: 'design.{node}.class — node NOT enumerated', reversible: false, reason: 'NODE_NOT_ENUMERATED' },
  { v1: 'class / style : null (empty appearance)', v2: '— dropped (Design.{class,style} is string|ConditionMap, never null)', reversible: false, reason: 'DESIGN_NULL_DROP' },

  // -- behavior (opaque scripts) --
  { v1: 'onchange / onclick / onload (script)', v2: 'behavior.onchange / .onclick / .onload', reversible: true },
  { v1: 'onchange / onclick / onload (boolean flag)', v2: '— dropped (BehaviorAction is string|{label,script}, not a flag)', reversible: false, reason: 'BEHAVIOR_FLAG_NORMALIZE' },
  { v1: 'ready', v2: '— synthesized product (no inverse)', reversible: false, reason: 'SYNTHESIZED_PRODUCT' },

  // -- lang dimension --
  { v1: 'lang: append', v2: 'lang.mode: append', reversible: true },
  { v1: 'langs', v2: 'lang.only', reversible: true },
  { v1: 'lang_name', v2: 'lang.name', reversible: true },
  { v1: 'lang_key', v2: 'lang.key', reversible: true },
  { v1: 'remove_lang_frame', v2: 'lang.frame (boolean inversion)', reversible: true },
  { v1: 'remove_lang_title', v2: 'lang.title (inversion)', reversible: true },
  { v1: 'lang_group_class', v2: 'lang.group_class', reversible: true },
  { v1: '*_langs synthesized group', v2: 'lang bucket (reclaimed)', reversible: false, reason: 'LANGS_GROUP_SYNTHESIS' },

  // -- multiple dimension --
  { v1: 'multiple: true', v2: 'multiple: true', reversible: true },
  { v1: 'multiple: only', v2: 'multiple: true (+ [] name normalization)', reversible: false, reason: 'MULTIPLE_ONLY_FOLD' },
  { v1: 'multiple_max', v2: 'multiple.max', reversible: true },
  { v1: 'sortable / sortable_button / sortable_onchange', v2: 'multiple.sortable (+ onclick)', reversible: true },
  { v1: 'add_buttons / remove_list_button / list_button_text / multiple_copy', v2: 'multiple.copy', reversible: true },
  { v1: 'multiple_button_onclick', v2: 'multiple.onclick', reversible: true },

  // -- composition --
  { v1: '$ref', v2: '$ref', reversible: true },
  { v1: '$after / $before', v2: '$patch (add; position absorbed)', reversible: false, reason: 'PATCH_ABSORPTION' },
  { v1: '$merge / $change', v2: '$patch (deep merge/replace)', reversible: false, reason: 'PATCH_ABSORPTION' },
  { v1: '$remove', v2: '$patch (remove)', reversible: false, reason: 'PATCH_ABSORPTION' },

  // -- items (static + dynamic source) --
  { v1: 'items (static map/array)', v2: 'items (polymorphic)', reversible: true },
  { v1: 'items dynamic source (model/method/table/relations)', v2: 'items.{model,method,table,relations}', reversible: true },
  { v1: 'items : null / empty items', v2: '— dropped (Items is array|source|label-map, never null)', reversible: false, reason: 'ITEMS_NULL_DROP' },
  { v1: 'items numeric/non-string label', v2: 'items label stringified (ItemLabel is string|LangMap|null, never a number)', reversible: false, reason: 'ITEM_LABEL_STRINGIFY' },

  // -- options (type-dependent open bucket) --
  { v1: 'type-dependent keys (readonly/value/href/accept/rows/width/height/…)', v2: 'options.{key}', reversible: true },
  { v1: 'container chrome (collapse/expend/view_total/stepper/blank_message)', v2: 'options.{key}', reversible: true },
  { v1: 'type-dependent scripts/callbacks (callback/event)', v2: 'options.callback / options.event', reversible: true },

  // -- comment strip / encoding products --
  { v1: 'x{key} (xclass/xstyle/x…)', v2: '— removed (comment strip)', reversible: false, reason: 'XKEY_STRIP' },
  { v1: 'seqtokey / __13hex__', v2: '— data-layer hidden id (G4)', reversible: false, reason: 'SYNTHESIZED_PRODUCT' },

  // -- first-class passthrough --
  { v1: 'label / description / placeholder / prepend / append / help / name / type / default / properties', v2: 'same first-class key (passthrough)', reversible: true },
  { v1: 'label / description / … : null (empty content)', v2: '— dropped (empty content node = absent key)', reversible: false, reason: 'CONTENT_NULL_DROP' },

  // -- structure inference --
  { v1: 'properties present, type absent', v2: 'type: group (injected — Field.required=[type])', reversible: false, reason: 'TYPE_GROUP_INJECTED' },
  { v1: 'properties : null / empty (no children)', v2: 'type: group + properties:{} (empty group, not a typeless options node)', reversible: false, reason: 'EMPTY_PROPERTIES_GROUP' },

  // -- items dynamic source vs HTTP verb --
  { v1: 'method (lone, no model/table/relations/items sibling)', v2: 'options.method (form/field HTTP verb, NOT items source)', reversible: true },
];

/** Result of translating a single v1 spec tree into v2, with a translation log. */
export interface TranslateResult {
  /** The translated v2 spec (meta-schema-clean, zero meta keys). */
  v2: V2Spec;
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
  v1Key: string;
  /** The R7 reason it cannot round-trip. */
  reason: IrreversibleReason;
  /** Human-readable detail. */
  detail: string;
}
