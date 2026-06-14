/**
 * Form-spec v2 Field Type Definitions (canonical, reference)
 *
 * Single source of truth for the v2 field model, mechanized from SPEC-V2.md
 * (the v2 constitution) and EXPRESSION-GRAMMAR.md (the expression engine).
 *
 * This is v2-NEW. It does NOT modify or replace the v1 model in `../types.ts`
 * (R7 parallel run — v1 stays stable until v2 is proven). These types are a
 * reference model for the canonical shape; runtime parsing/validation is built
 * on top of them, not in this file.
 *
 * Model invariants enforced here:
 * - Role slots `validate`/`design`/`behavior`/`options` are polymorphic:
 *   `false` (off) | `{}`/`true` (on, `true` is shorthand for `{}`) | `{ ...spec }`.
 * - Dependency isolation: type-dependent keys live under `options`; structure-
 *   dependent keys live under `multiple`/`lang`/`items` themselves.
 * - `design` exposes a per-DOM-node appearance map (show/class/style/label/
 *   wrapper/group/prepend) — which node a style targets is visible in the key.
 * - Every evaluated value is an expression or a condition map; the condition
 *   map default key is the always-true `true` (no convention symbols like `_`).
 * - Composition via `$ref`/`$patch` (resolution order `$ref` → `$patch` →
 *   single spec → field layer).
 * - Condition-only meta keys (display_switch/display_target/if/when/show_if/…),
 *   magic tokens (`_`), and legacy directives ($after/$before/$merge/$remove)
 *   do NOT exist in this model (G1). A schema layer rejects every forbidden key
 *   globally — one level below every slot and bucket, not just at top level
 *   (open buckets via `propertyNames`, closed shapes via
 *   `additionalProperties: false`). See `FORBIDDEN_META_KEYS`.
 *
 * Round-trip: these types fix the canonical JSON shape, so a v2 document parsed
 * with `JSON.parse` (key order preserved by the engine) and re-serialized is
 * identical. The polymorphic slots/buckets (`false`|`{}`|`true`) and the
 * declaration-ordered condition map / `properties` survive the round trip. The
 * adjacent `types.roundtrip.test.ts` proves it. The Go/Rust siblings carry the
 * custom (de)serialization that preserves the same shapes.
 */

// ============================================================================
// Expression & Condition Map (G1 / EXPRESSION-GRAMMAR §2, §8)
// ============================================================================

/**
 * A single restricted-DSL expression string (EXPRESSION-GRAMMAR §2): paths
 * (`.`/`..`/`*`), comparisons, logic, `in`/`not in`, ternary `?:`, parentheses,
 * literals. No arithmetic, functions, methods, regex, or `eval`. A bare ternary
 * `"...?...:..."` is the shorthand of a condition map (same semantics).
 */
export type Expression = string;

/**
 * Declaration-ordered condition map (EXPRESSION-GRAMMAR §8). Each key is an
 * Expression (§2 grammar); keys are evaluated top-to-bottom and the value of the
 * first truthy key is returned. If none match, the value of the `true` key (the
 * always-true default) is used; if absent, `null`. The default key is always
 * literal `true` — convention symbols such as `_` are forbidden (R4).
 *
 * The condition map is a thin wrapper that calls the engine repeatedly; it is
 * not a separate parser.
 */
export type ConditionMap<V = unknown> = {
  /** Default (else) branch: the always-true condition. */
  true?: V;
  /** Expression key → value returned when that expression is the first truthy. */
  [expression: string]: V | undefined;
};

/**
 * An evaluated value: either a single Expression or a ConditionMap. Used by
 * `design.show`/`design.class`/`design.style`, conditional `validate.*`, etc.
 * The call site fixes the expected result type (boolean for `show`, string for
 * `class`/`style`, …).
 */
export type Evaluated<V = unknown> = V | Expression | ConditionMap<V>;

/**
 * Multilingual content map (G3 content translation): a value translated per
 * language by the spec author, e.g. `{ ko: '이메일', en: 'Email' }`. Distinct
 * from `lang` (G3 input multilingualism, a structural dimension). An empty
 * language slot may be `null` (no value — identical to absent; no render/validate
 * effect, SPEC §2 G3).
 */
export type LangMap = Record<string, string | null>;

/**
 * Field content text that may be a plain string or a per-language LangMap (G3).
 * Empty content is omitted or `null` — `null` is identical to absent and has no
 * render/validate effect (SPEC §2 G3).
 */
export type LocalizedText = string | LangMap | null;

/**
 * Polymorphic role-slot value (SPEC-V2 G2). `false` turns the slot off (and
 * nullifies composed inheritance); `true` is the shorthand for `{}` (default
 * on); an object carries the slot's settings.
 */
export type Slot<T> = false | true | T;

// ============================================================================
// Field Spec (top-level — structure / identity / content + role slots)
// ============================================================================

/**
 * v2 field specification. Top level holds only first-class keys (SPEC-V2 §3 B):
 * structure/identity, content, and the four role slots. All non-first-class
 * detail is pushed under its dependency target (§3 C). A schema layer closes the
 * top level (`additionalProperties: false`) and rejects every `FORBIDDEN_META_KEYS`
 * entry here and one level below every slot/bucket.
 */
export interface FieldSpecV2 {
  // -- Identity / structure (first-class) --

  /**
   * Identity — the field type (e.g. `email`, `group`, `multiple`). The type is
   * the definer/validator of the `options` slot.
   */
  type: string;
  /** Structure / identity — field name (serialization key). */
  name?: string;
  /** Content — field label (LangMap when multilingual, G3). */
  label?: LocalizedText;
  /**
   * Structure — default value. The evaluator references it when a path does not
   * resolve (EXPRESSION-GRAMMAR §5 Path).
   */
  default?: unknown;
  /**
   * Structure — child field map (group/object). Entry point for `$ref`/`$patch`
   * composition.
   */
  properties?: PropertiesV2;
  /**
   * Structure — option source. Static array, or a dynamic `{ model, method,
   * table, relations }` source. A dependency-isolation bucket and first-class.
   */
  items?: ItemsV2;
  /**
   * Structure — repeated rows. `true` = index array + hidden id (G4). A
   * dependency-isolation bucket and first-class.
   */
  multiple?: MultipleV2;
  /**
   * Structure — input multilingual dimension (the field value is per-language,
   * G3). A dependency-isolation bucket and first-class.
   */
  lang?: LangV2;

  // -- Content (first-class) --

  /** Content — description (may be multilingual). */
  description?: LocalizedText;
  /** Content — placeholder (may be multilingual). */
  placeholder?: LocalizedText;
  /** Content — text rendered before the input. */
  prepend?: LocalizedText;
  /** Content — text rendered after the input. */
  append?: LocalizedText;
  /** Content — help text (may be multilingual). */
  help?: LocalizedText;

  // -- Role slots (first-class, polymorphic) --

  /** Role slot — validation (SPEC-V2 §3 common-role distribution). */
  validate?: Slot<ValidateSlot>;
  /** Role slot — appearance = visibility + per-node external appearance map. */
  design?: Slot<DesignSlot>;
  /**
   * Role slot — behavior (opaque script, NOT routed through the expression
   * engine). `false` nullifies composed inheritance.
   */
  behavior?: Slot<BehaviorSlot>;
  /**
   * Role slot — type-dependent settings (the type defines and validates them;
   * the core stays uninvolved).
   */
  options?: Slot<OptionsSlot>;

  // -- Composition (SPEC-V2 §5) --

  /**
   * Base inheritance (file/path). The parser expands it first — an unresolved
   * `$ref` cannot be loaded.
   */
  $ref?: string;
  /**
   * Change directive (add/remove/replace, JSON Patch style). Supports deep-path
   * set, e.g. `'field.validate.required': '.other'`.
   */
  $patch?: PatchDirective;
}

/**
 * Child field map (group/object). A `$ref`/`$patch` composition entry may sit
 * alongside named child fields; the parser expands composition first, then the
 * field layer.
 */
export type PropertiesV2 = {
  /** Base inheritance for the whole child map. */
  $ref?: string;
  /** Composition change directive for the child map. */
  $patch?: PatchDirective;
} & {
  [fieldName: string]: FieldSpecV2 | string | PatchDirective | undefined;
};

/**
 * Composition change directive ($patch). Deep paths map to values
 * (set/replace); the resolution order is `$ref` → `$patch` → single spec →
 * field layer. Legacy `$after`/`$before`/`$merge`/`$remove` are absorbed here.
 */
export interface PatchDirective {
  /** Deep-path key (e.g. `'field.validate.required'`) → patched value. */
  [path: string]: unknown;
}

// ============================================================================
// validate slot (polymorphic — value may be expression / condition map)
// ============================================================================

/**
 * Validation rules (SPEC-V2 §3 `slots.validate`). Each value may be an
 * expression/condition map, expressing conditional validation without a separate
 * key (e.g. `required: '.subscribe'`, `email: true`) — the condition is the
 * value's expression (G1), never a separate key.
 *
 * The named sub-keys are the canonical `slots.validate.sub_keys`
 * (`required`/`email`/`match`). The slot is polymorphic: any other registered
 * rule (e.g. `min`/`max`/`minlength`) is admitted by the index signature, but a
 * forbidden meta key never is — a schema layer rejects forbidden keys one level
 * below every slot via `propertyNames`, not by widening this type.
 */
export interface ValidateSlot {
  /** Requires a non-empty value; an expression gates the requirement. */
  required?: Evaluated<boolean>;
  /** Requires a syntactically valid email address. */
  email?: Evaluated<boolean>;
  /** Regular expression the value must match. */
  match?: Evaluated<string>;
  /** Index signature for additional registered rules (each value is evaluated). */
  [rule: string]: Evaluated<unknown> | undefined;
}

// ============================================================================
// design slot (appearance = visibility + per-DOM-node appearance map, R8)
// ============================================================================

/**
 * Per-node appearance: `class`/`style` for one DOM node. Both values are
 * evaluated (expression or condition map) and yield strings.
 */
export interface DesignNode {
  /** CSS class for this node (evaluated → string). */
  class?: Evaluated<string>;
  /** Inline style for this node (evaluated → string). */
  style?: Evaluated<string>;
}

/**
 * Appearance slot = visibility condition (`show`) + per-DOM-node appearance map
 * (R8). `class`/`style` target the main (input) node; `label`/`wrapper`/`group`/
 * `prepend` target their respective nodes — which node a style targets is
 * visible in the key. Absorbs legacy `element_class`/`label_class`/`group_class`/
 * `input_class`/`wrapper_class`/`prepend_class`.
 */
export interface DesignSlot {
  /** Visibility condition (evaluated → boolean). */
  show?: Evaluated<boolean>;
  /** Main (input) node class (evaluated → string). */
  class?: Evaluated<string>;
  /** Main (input) node inline style (evaluated → string). */
  style?: Evaluated<string>;
  /** Label node appearance. */
  label?: DesignNode;
  /** Wrapper node appearance. */
  wrapper?: DesignNode;
  /** Group node appearance. */
  group?: DesignNode;
  /** Prepend node appearance. */
  prepend?: DesignNode;
}

/** Design node names (the per-DOM-node appearance map keys). */
export type DesignNodeName =
  | 'show'
  | 'class'
  | 'style'
  | 'label'
  | 'wrapper'
  | 'group'
  | 'prepend';

// ============================================================================
// behavior slot (opaque scripts — NOT routed through the expression engine)
// ============================================================================

/**
 * A behavior entry: an opaque client-JS script string, or `{ script, label }`
 * where the action label sits adjacent (`behavior.{action}.label`).
 */
export type BehaviorEntry =
  | string
  | {
      /** Opaque client-JS passed through verbatim (not parsed by the engine). */
      script?: string;
      /** Action label, adjacent to the action it modifies. */
      label?: LocalizedText;
    };

/**
 * Common (all-type) behavior scripts (SPEC-V2 §4). Values are opaque client JS
 * passed through verbatim and never routed through the expression engine.
 * `behavior: false` nullifies composed inheritance.
 */
export interface BehaviorSlot {
  /** Change handler (opaque script). */
  onchange?: BehaviorEntry;
  /** Click handler (opaque script). */
  onclick?: BehaviorEntry;
  /** Load handler (opaque script). */
  onload?: BehaviorEntry;
  /** Index signature for additional opaque action handlers. */
  [action: string]: BehaviorEntry | undefined;
}

// ============================================================================
// options slot (type-dependent — the type defines & validates; core uninvolved)
// ============================================================================

/**
 * Type-dependent settings (dependency isolation: type → `options`). Defined and
 * validated by the field's type; the core does not interpret them, so a new
 * widget leaves the core unchanged. Container-type chrome and type-dependent
 * scripts/callbacks live here too. The listed keys are common examples; the
 * index signature admits any type-specific key.
 */
export interface OptionsSlot {
  /** Minimum keyword length (e.g. autocomplete trigger). */
  keyword_min_length?: number;
  /** Whether the map marker is draggable. */
  marker_draggable?: boolean;
  /** Map zoom level. */
  zoom?: number;
  /** Geometry type (e.g. point/line/polygon). */
  geometry_type?: string;
  /** Maximum number of tags. */
  max_tags?: number;
  /** Label rendered next to a checkbox. */
  checkbox_label?: LocalizedText;
  /** Label for the "on" state of a toggle. */
  on_label?: LocalizedText;
  /** Container chrome — collapse state. */
  collapse?: boolean;
  /** Container chrome — expand state. */
  expend?: boolean;
  /** Container chrome — show a total count. */
  view_total?: boolean;
  /** Container chrome — stepper UI. */
  stepper?: boolean;
  /** Message shown when blank/empty. */
  blank_message?: LocalizedText;
  /** Type-dependent callback (e.g. select2). */
  callback?: string;
  /** Type-dependent event config (e.g. datetime). */
  event?: unknown;
  /** Index signature — any type-specific option key. */
  [option: string]: unknown;
}

// ============================================================================
// items bucket (option source — static array | dynamic source, polymorphic)
// ============================================================================

/**
 * Dynamic option source (dependency isolation: dynamic items → `items` sub).
 * Replaces option keys that legacy scattered elsewhere.
 */
export interface ItemsSource {
  /** Data model the options are loaded from. */
  model?: string;
  /** Method on the model invoked to fetch option rows. */
  method?: string;
  /** Table the options are loaded from. */
  table?: string;
  /** Relation descriptors used when loading options. */
  relations?: unknown;
}

/**
 * Option source. Either a static array of choices, a static value→label map
 * (`ItemLabelMap`), or a dynamic `ItemsSource` (polymorphic). A
 * dependency-isolation bucket and first-class (SPEC §2 G3 / §3 C).
 */
export type ItemsV2 = StaticItem[] | ItemLabelMap | ItemsSource;

/**
 * A static option label (display only). A plain string or a per-language LangMap
 * (G3 content translation); the option VALUE is the map key, the label is just
 * for display, so the label never participates in membership. Empty label may be
 * `null` (SPEC §2 G3).
 */
export type ItemLabel = LocalizedText;

/**
 * Static value→label map (SPEC §2 G3): the key is the option value (the
 * membership target), the entry is its display label — a string or a LangMap,
 * e.g. `{ "0": { ko: '미사용', en: 'Off' }, "1": { ko: '사용', en: 'On' } }`.
 * The label is display-only; a LangMap label is NOT a membership value.
 */
export type ItemLabelMap = Record<string, ItemLabel>;

/** A static option: a value→label map entry or a primitive value. */
export type StaticItem =
  | { value: unknown; label?: ItemLabel }
  | Record<string, unknown>
  | string
  | number;

// ============================================================================
// multiple bucket (repeated rows — multiple-dependent keys live under it)
// ============================================================================

/**
 * Repeated-row settings (dependency isolation: multiple-dependent → `multiple`
 * sub). When the value is `true`, it is the bare default (index array + hidden
 * id, G4). An object carries the repetition settings.
 *
 * The named keys are the canonical `dependency_buckets.multiple.keys`
 * (`max`/`copy`/`sortable`/`onclick`). Legacy names are NOT recognition keys
 * here (R2 anti-duplication, R4 no magic tokens); a translator maps them in:
 * `multiple_max`→`max`, `sortable*`→`sortable`, `add_buttons`/
 * `remove_list_button`/`list_button_text`→`copy`, `multiple_button_onclick`→
 * `onclick`. Only the canonical names appear below.
 */
export type MultipleV2 = boolean | MultipleSettings;

/** Repeated-row settings object (kept under `multiple`). */
export interface MultipleSettings {
  /** Maximum number of rows. */
  max?: number;
  /** Whether a row can be copied/added/removed (absorbs the legacy button keys). */
  copy?: boolean;
  /** Whether rows are sortable. */
  sortable?: boolean;
  /** Row-level click handler (opaque script). */
  onclick?: string;
  /** Index signature for additional multiple-dependent keys (forbidden keys excluded by the schema layer). */
  [key: string]: unknown;
}

// ============================================================================
// lang bucket (input multilingual dimension — lang-dependent keys live under it)
// ============================================================================

/**
 * Input multilingual settings (dependency isolation: lang-dependent → `lang`
 * sub). `true` is the bare default. An object carries the dimension settings,
 * including the language-group chrome (`frame`/`title`/`group_class`). Absorbs
 * legacy `lang:append`/`langs`/`lang_name`/`lang_key`/`remove_lang_frame`/
 * `remove_lang_title`/`lang_group_class`.
 */
export type LangV2 = boolean | LangSettings;

/**
 * Per-language override map (one of the two `lang.only` shapes, SPEC-V2 §3 C):
 * `{ ja: { validate: … }, en: { validate: … } }`. The key is a language code,
 * the value is the role-slot override (`validate`/`design`/`behavior`/`options`)
 * applied to that language's input only. Distinct from the allowlist `string[]`:
 * the allowlist restricts which languages render, the override map redefines
 * slots per language. Absorbs the legacy per-language `langs` map shape.
 */
export interface LangOverride {
  validate?: Slot<ValidateSlot>;
  design?: Slot<DesignSlot>;
  behavior?: Slot<BehaviorSlot>;
  options?: Slot<OptionsSlot>;
}
export type LangOverrideMap = Record<string, LangOverride>;

/** Input multilingual settings object (kept under `lang`). */
export interface LangSettings {
  /** Expansion mode (e.g. append). */
  mode?: string;
  /**
   * Two shapes (SPEC-V2 §3 C): a language allowlist `['ko', 'en']` (`string[]`)
   * OR a per-language override map `{ ja: { validate: … } }`
   * (`LangOverrideMap`). The allowlist restricts the rendered languages; the
   * override map redefines role slots per language. Absorbs the legacy `langs`
   * allowlist and the legacy per-language `langs` map.
   */
  only?: string[] | LangOverrideMap;
  /** Name override for the language group. */
  name?: string;
  /** Key override for the language group. */
  key?: string;
  /** Whether the language frame is shown. */
  frame?: boolean;
  /** Language-group title. */
  title?: LocalizedText;
  /** Language-group CSS class. */
  group_class?: string;
  /** Index signature for additional lang-dependent keys. */
  [key: string]: unknown;
}

// ============================================================================
// Forbidden meta keys (assertion-only — present for documentation & tooling)
// ============================================================================

/**
 * Meta keys forbidden by the v2 model (canonical `forbidden_meta_keys`):
 * condition-only meta keys (`display_switch`/`display_target`/`if`/`when`/
 * `show_if`), the magic default sigil `_`, legacy composition directives
 * (`$after`/`$before`/`$merge`/`$remove`, all absorbed by `$patch`), and legacy
 * appearance shims (`xclass`/`xstyle`, absorbed by the design node map). They
 * must NOT appear anywhere in a v2 spec.
 *
 * Global rejection (not just top level): a schema layer rejects these keys one
 * level below every slot and bucket too — open buckets (`options`, etc.) use
 * `propertyNames: { not: { enum: [...forbidden...] } }` to admit type-specific
 * extension while still blocking every forbidden key. Closed shapes use
 * `additionalProperties: false`.
 *
 * `x{key}` (an `x`-prefixed comment key, e.g. `xclass`/`xstyle`/`xnote`) is also
 * forbidden in the canonical model, but it is a PATTERN, not a literal, so it is
 * not enumerated here. Premise: the meta-schema strips every `x`-prefixed key
 * (x-strip) BEFORE validating the canonical spec — an `x{key}` is rejected from
 * the canonical document, but the reason is that it is a stripped comment, not a
 * recognized field. Tooling matches it with `^x` rather than this enum.
 *
 * This constant exists so tooling can assert these keys' absence — it never
 * widens the model.
 */
export const FORBIDDEN_META_KEYS = [
  'display_switch',
  'display_target',
  'if',
  'when',
  'show_if',
  '_',
  'seqtokey',
  '__13hex__',
  '$after',
  '$before',
  '$merge',
  '$remove',
  'xclass',
  'xstyle',
] as const;

/** A meta key that the v2 model forbids (enumerated literals; `x{key}` matched by pattern). */
export type ForbiddenMetaKey = (typeof FORBIDDEN_META_KEYS)[number];

/**
 * Pattern for the forbidden `x{key}` comment family (x-strip premise above).
 * The meta-schema strips matches before canonical validation; tooling rejects
 * any key matching this in a canonical document.
 */
export const FORBIDDEN_META_KEY_PATTERN = /^x/;
