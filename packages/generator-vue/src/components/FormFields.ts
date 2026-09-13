import { h, type VNode, type VNodeRef } from 'vue';
import type { NodeVM } from '@crudui/generator-core';
import { nodeVNode } from './Node';

/** Build the `crudui-form` block vnode around the top-level nodes. */
export function FormFields(fields: NodeVM[], rootRef?: VNodeRef): VNode {
  return h('div', { class: 'crudui-form', ref: rootRef }, [
    h('div', { class: 'crudui-form__body' }, fields.map((vm) => nodeVNode(vm))),
  ]);
}
