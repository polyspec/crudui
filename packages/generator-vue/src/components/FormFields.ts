import { h, type VNode, type VNodeRef } from 'vue';
import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@polyspec/crudui-generator-core';
import type { FormRenderModel } from '@polyspec/crudui-generator-core/internal';
import { nodeVNode } from './Node.js';

/**
 * Build the `crudui-form` block vnode: the root description, form errors, the top-level nodes and
 * the footer with the form buttons. `model` holds checked render options and `description` the
 * translated root description (form-runtime.md, "Complete form").
 */
export function FormFields(
  fields: NodeVM[], buttons: ButtonVM[], messages: FormMessages, rootRef?: VNodeRef, model?: FormRenderModel, description = '',
): VNode {
  const formErrors = model?.formErrors ?? [];
  return h('div', { class: 'crudui-form', ref: rootRef }, [
    ...(description !== '' ? [h('p', { class: 'crudui-form__description' }, description)] : []),
    ...(formErrors.length ? [h('div', { class: 'crudui-form__errors' }, formErrors.map((text) => h('p', { class: 'crudui-form__error' }, text)))] : []),
    h('div', { class: 'crudui-form__body' }, fields.map((vm) => nodeVNode(vm, model?.nodeErrors))),
    h('div', { class: 'crudui-form__footer' }, [
      h('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formActions, innerHTML: formButtonsHtml(buttons) }),
    ]),
  ]);
}
