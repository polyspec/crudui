/**
 * CRUDUI Svelte field helpers — pure envelope string computations (NO markup).
 *
 * Field.svelte owns the real envelope element tree; these helpers only map the
 * core's pre-evaluated `ResolvedDesign` strings to the class/style values the
 * envelope nodes carry. eval is never called; nothing is recomputed.
 */

import type { FieldViewModel } from '@crudui/generator-core';

/** form-element-wrapper class: base + design.wrapper.class. */
export function wrapperClass(vm: FieldViewModel): string {
  return ['form-element-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

/** form-element-wrapper style: 'display: none' (show=false) merged with extra. */
export function wrapperStyle(vm: FieldViewModel): string | undefined {
  const hidden = vm.design.show ? '' : 'display: none';
  const extra = vm.design.wrapper.style?.trim() ?? '';
  const merged = [hidden, extra].filter((s) => s).join('; ');
  return merged || undefined;
}

/** input-group-wrapper class for a single field (leaf/group/lang). */
export function inputGroupWrapperClass(vm: FieldViewModel): string {
  return ['input-group-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

/** lang-code span html (raw, for root-raw lang children). */
export function langCodeSpan(code: string): string {
  const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="input-group-text lang-code">${esc}</span>`;
}
