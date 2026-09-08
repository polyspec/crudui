/**
 * CRUDUI Svelte field helpers — pure envelope string computations (NO markup).
 *
 * Field.svelte owns the real envelope element tree; these helpers only map the
 * core's pre-evaluated `ResolvedDesign` strings to the class/style values the
 * envelope nodes carry. eval is never called; nothing is recomputed.
 */
import type { FieldViewModel } from '@crudui/generator-core';
/** form-element-wrapper class: base + design.wrapper.class. */
export declare function wrapperClass(vm: FieldViewModel): string;
/** form-element-wrapper style: 'display: none' (show=false) merged with extra. */
export declare function wrapperStyle(vm: FieldViewModel): string | undefined;
/** input-group-wrapper class for a single field (leaf/group/lang). */
export declare function inputGroupWrapperClass(vm: FieldViewModel): string;
/** lang-code span html (raw, for root-raw lang children). */
export declare function langCodeSpan(code: string): string;
//# sourceMappingURL=field.d.ts.map