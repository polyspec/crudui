/**
 * legacyDisplay — pure ports of the legacy Limepie conditional-display
 * pipeline. Ported from
 * packages/generator-react/src/legacy/hooks/legacyDisplay.ts (the verified parity
 * blueprint). The only adaptation: legacyWrapperStyle returns a CSS STRING
 * (Svelte style attribute) instead of a React CSSProperties object.
 *
 *   - applyDisplaySwitchTransform : Form\Parser\ElementVisibilityManager
 *   - resolveDisplayTargetParts   : Fields\Group::processSingleTarget
 *
 * Contract pinned by the references (registration.html, ProductNft.html):
 *   - Legacy NEVER removes a condition-failing field from the DOM. The
 *     wrapper keeps an identifying class and is hidden via display:none.
 */
import { type SpecNode } from './components/fields/limepieParity';
/** Deterministic 5-char display token from a stable seed (controlling field
 *  dot path). Matches the parity mask `_[a-hj-km-np-z2-9]{5}`. */
export declare function displayTokenForSeed(seed: string): string;
/** Port of \Limepie\minify_js(). Inline onchange/onclick spec JS passes
 *  through this before being emitted — the references contain the minified form. */
export declare function minifyJs(input: string): string;
/** Map-form display_switch ({ scriptKey: [element, ...] }). */
export declare function isDisplaySwitchMap(v: unknown): v is Record<string, unknown>;
/**
 * Recursive pass over every `properties` level. Returns a DEEP CLONE.
 */
export declare function applyDisplaySwitchTransform<T>(spec: T): T;
/** Fields\Group::resolveRelativePath — '.x' = sibling scope, '..x' = one up. */
export declare function resolveRelativePath(targetPath: string, currentPath: string): string;
/** Resolved display-target presentation: wrapper classes and inline style. */
export interface DisplayTargetParts {
    /** Extra wrapper class names to apply. */
    addClass: string[];
    /** Inline style string for the wrapper, or null when none. */
    style: string | null;
}
/**
 * Port of processSingleTarget + the displayUnique resolution in Group::write.
 * parentDotPath = the dot path of the PARENT group ('' for top-level fields).
 */
export declare function resolveDisplayTargetParts(fieldSpec: SpecNode, parentDotPath: string, data: unknown, rootSpec: SpecNode): DisplayTargetParts;
/** True when the spec carries legacy condition maps. */
export declare function hasDisplayTargetConditionMaps(fieldSpec: SpecNode): boolean;
/**
 * form-element-wrapper class chain: base, spec.class (trimmed), element.all_of
 * class, then display_target_condition_class matches.
 */
export declare function legacyWrapperClassName(spec: SpecNode, allOfClassName: string | null | undefined, condition: DisplayTargetParts | null): string;
/**
 * form-element-wrapper style chain (returns a CSS STRING or undefined):
 * spec.style, element.all_of inline, displayUnique, then display:none when
 * invisible — legacy never removes a hidden field from the DOM.
 */
export declare function legacyWrapperStyle(spec: SpecNode, allOfStyle: string | null | undefined, condition: DisplayTargetParts | null, hidden?: boolean): string | undefined;
//# sourceMappingURL=legacyDisplay.d.ts.map