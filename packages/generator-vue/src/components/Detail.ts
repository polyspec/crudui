/** CRUDUI Vue read-only detail component backed by the shared detail model. */

import { Fragment, h, type VNode } from 'vue';
import type { DetailViewModel, DetailFieldVM } from '@polyspec/crudui-generator-core';
import { actionsVNode, cellDisplayVNode } from './List.js';
import { rawContainer } from './raw.js';

function fieldClass(field: DetailFieldVM): string {
  return ['crudui-detail__value', 'crudui-value', `crudui-value--${field.format.type}`, field.design.main.class]
    .filter((value) => value && value.trim()).join(' ').trim();
}

function fieldVNode(field: DetailFieldVM): VNode {
  const display = field.display;
  const props = { class: fieldClass(field), ...(field.design.main.style ? { style: field.design.main.style } : {}) };
  const value = typeof display !== 'string' && display.kind === 'html'
    ? rawContainer('dd', props, display.html)
    : h('dd', props, [cellDisplayVNode(display)]);
  return h('div', { class: 'crudui-detail__field' }, [h('dt', { class: 'crudui-detail__label' }, field.label), value]);
}

/**
 * Render an evaluated read-only detail model without data access or evaluation: the actions,
 * when the detail has any, and the definition list.
 */
export function Detail(vm: DetailViewModel): VNode {
  const list = h('dl', {
    class: ['crudui-detail', vm.design.wrapper.class].filter((value) => value && value.trim()).join(' ').trim(),
    ...(vm.design.wrapper.style ? { style: vm.design.wrapper.style } : {}),
  }, vm.fields.map(fieldVNode));
  const actions = actionsVNode(vm.actions, 'crudui-detail');
  return actions ? h(Fragment, [actions, list]) : list;
}
