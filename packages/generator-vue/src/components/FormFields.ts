import { h, type VNode, type VNodeRef } from 'vue';
import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@crudui/generator-core';
import { nodeVNode } from './Node';

/** Build the `crudui-form` block vnode: the top-level nodes and the footer with the form buttons. */
export function FormFields(fields: NodeVM[], buttons: ButtonVM[], messages: FormMessages, rootRef?: VNodeRef): VNode {
  return h('div', { class: 'crudui-form', ref: rootRef }, [
    h('div', { class: 'crudui-form__body' }, fields.map((vm) => nodeVNode(vm))),
    h('div', { class: 'crudui-form__footer' }, [
      h('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formActions, innerHTML: formButtonsHtml(buttons) }),
    ]),
  ]);
}
