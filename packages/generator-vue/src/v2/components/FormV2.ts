/**
 * v2 Vue form renderer — `FormV2` builds the composed field list as vnodes.
 *
 * It takes the core's already-built `FieldViewModel[]` (compose + design eval +
 * i18n + tree) and maps each top-level field to a `Field` vnode inside the
 * `.form-group` envelope. A pure presentational vnode tree: no evaluation, no
 * string concatenation, no completed-form HTML echo. SSR via
 * @vue/server-renderer renderToString (ssr.ts) produces the limepie envelope
 * byte-compatibly after normalization.
 */

import { h, type VNode } from 'vue';
import type { FieldViewModel } from '@polyspec/generator-core';
import { fieldVNode } from './Field';

/** Build the `.form-group` envelope vnode around the top-level fields. */
export function FormV2(fields: FieldViewModel[]): VNode {
  return h(
    'div',
    { class: 'form-group' },
    fields.map((vm) => fieldVNode(vm))
  );
}
