/**
 * limepieParity — framework-independent field-level helpers reproducing the
 * Limepie PHP Generator\Fields output semantics. Ported verbatim from
 * packages/generator-react/src/legacy/components/fields/limepieParity.ts (the
 * verified parity blueprint); the only adaptation is that style helpers
 * return a CSS STRING (Svelte uses string style attributes) instead of a
 * React CSSProperties object.
 *
 * The reference fixtures (tests/fixtures/reference-html) are the single source of
 * truth. Do NOT "improve" these helpers — every rule is a verbatim port of
 * the PHP implementation.
 */
export type SpecNode = Record<string, unknown>;
/**
 * PHP (string) cast semantics for scalar spec/data values.
 * false -> '', true -> '1', null/undefined -> '', arrays/objects -> ''.
 */
export declare function phpString(v: unknown): string;
/**
 * PHP truthiness of an already string-cast value ('' and '0' are falsy).
 */
export declare function phpTruthy(s: string): boolean;
/**
 * PHP (float) cast rendered through string interpolation:
 * (float)'10' -> "10", (float)'0.50' -> "0.5", (float)'abc' -> "0".
 */
export declare function phpFloatString(v: unknown): string;
/**
 * Effective display value following the PHP field pattern:
 *   if (0 === strlen((string)$value) && isset($property['default'])) use it.
 */
export declare function applyDefaultString(value: unknown, def: unknown): string;
/**
 * \Limepie\clean_str(): str_replace(['[]','][','[',']'], ['','-','-','-']).
 */
export declare function cleanStr(s: string): string;
/**
 * Leaf data-name for a dot path — the PHP `$propertyName` argument.
 */
export declare function leafName(path: string): string;
/**
 * data-rule-name for a dot path: bracket notation relative to the form root.
 */
export declare function ruleNameForPath(path: string): string;
/**
 * Ordered item entries for select/choice/multichoice/search `items`.
 */
export declare function itemEntries(items: unknown): Array<[string, unknown]>;
/**
 * Wrapper layer name for a dot path (Group::getDotName + "-layer").
 */
export declare function wrapperLayerName(path: string, keyPrefix?: string): string;
/**
 * The Limepie validation attribute trio.
 */
export declare function limepieDataAttrs(spec: SpecNode, path: string): Record<string, string>;
/**
 * Parse an inline CSS string into a CANONICAL CSS STRING for the Svelte
 * `style` attribute. Returns undefined for empty input so the style attribute
 * is omitted (normalize.js drops empty style="" anyway). Declarations are
 * trimmed and rejoined with "; " — the normalizer canonicalizes further.
 */
export declare function styleString(style: unknown): string | undefined;
/**
 * HTML attribute-value escaping for legacy-raw markup branches.
 */
export declare function escAttr(s: string): string;
/** HTML text escaping for legacy-raw markup branches. */
export declare function escText(s: string): string;
/**
 * Deterministic stand-in for PHP genRandomString(5) used in choice input ids.
 */
export declare function nextChoiceToken(): string;
/** Reset the choice token sequence between renders. */
export declare function resetChoiceTokens(): void;
//# sourceMappingURL=limepieParity.d.ts.map