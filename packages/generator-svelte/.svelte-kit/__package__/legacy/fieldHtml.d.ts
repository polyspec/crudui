/**
 * fieldHtml — pure HTML emitters for each leaf field type. Each function
 * reproduces the SSR output of the corresponding
 * packages/generator-react/src/components/fields/*.tsx component for an
 * empty-data render, byte-for-byte (verified against the reference fixtures
 * through tests/parity/normalize.js).
 *
 * Mirroring React: where a React field used dangerouslySetInnerHTML the raw
 * string is reproduced verbatim; where it emitted JSX elements, the same
 * attributes are serialized here (React omits undefined/false attributes and
 * renders value="" for empty strings — replicated). Attribute ORDER is not
 * load-bearing (the normalizer sorts), but PRESENCE and VALUES are.
 */
import { type SpecNode } from './components/fields/limepieParity';
import type { MultiLangText } from './i18n';
/** Inputs a field HTML emitter needs to render one leaf field. */
export interface FieldRenderCtx {
    /** The field's spec node. */
    spec: SpecNode;
    /** The field's current value. */
    value: unknown;
    /** Dot-path of the field within the form. */
    path: string;
    /** Name prefix applied to the field's `name`/`id`. */
    keyPrefix: string;
    /** Active language code for translation. */
    language: string;
    /** Translator resolving a multi-language text to a string. */
    t: (text: MultiLangText | undefined | null, fallback?: string) => string;
    /** Effective readonly (globalReadonly || spec.readonly === true). */
    readonly: boolean;
    /** Effective disabled (globalDisabled || spec.disabled === true). */
    disabled: boolean;
    /**
     * Legacy-raw multiple-row buttons HTML (React MultipleLeafField `buttonsHtml`
     * prop) — consumed by a field's raw branch at the `<!--btn-->` slot.
     */
    buttonsHtml?: string;
    /**
     * JSX-equivalent multiple-row buttons HTML (React MultipleLeafField `buttons`
     * prop) — consumed by a field's controlled branch at the same slot.
     */
    buttonsJsx?: string;
}
type FieldHtml = (ctx: FieldRenderCtx) => string;
/** True when a datetime spec carries inline-JS attributes (raw-wrapper case). */
export declare function datetimeNeedsRawHtml(spec: SpecNode): boolean;
/**
 * Verbatim port of Fields/Datetime.php inline-JS markup — rendered on the
 * .input-group-wrapper by FormField (the bare input has no own container).
 */
export declare function datetimeLegacyRawHtml(ctx: FieldRenderCtx): string;
/** Emits the inner markup for a switcher/toggle field (re-exported as `switcherHtml`). */
declare const switcher: FieldHtml;
/** Emits the inner markup for a single boolean checkbox field. */
export declare function checkboxInnerHtml(ctx: FieldRenderCtx): string;
/** Returns the field HTML emitter registered for a field `type`, or undefined. */
export declare function getFieldHtml(type: string): FieldHtml | undefined;
export { switcher as switcherHtml };
//# sourceMappingURL=fieldHtml.d.ts.map