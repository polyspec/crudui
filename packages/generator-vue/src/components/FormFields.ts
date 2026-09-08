import { h, type VNode, type VNodeRef } from 'vue';
import type { FieldViewModel } from '@crudui/generator-core';
import { fieldVNode } from './Field';

/** Build the `.form-group` envelope vnode around the top-level fields. */
export function FormFields(fields: FieldViewModel[], rootRef?: VNodeRef): VNode {
  return h(
    'div',
    { class: 'form-group', ref: rootRef },
    fields.map((vm) => fieldVNode(vm))
  );
}
