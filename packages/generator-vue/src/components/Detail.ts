/** CRUDUI Vue read-only detail component backed by the shared detail model. */

import { h, type VNode } from 'vue';
import type { DetailViewModel, DetailFieldVM } from '@crudui/generator-core';
import { cellDisplayVNode } from './List';

function fieldClass(field: DetailFieldVM): string {
  return ['detail-value', `detail-value-${field.format.type}`, field.design.main.class]
    .filter((value) => value && value.trim()).join(' ').trim();
}

function fieldVNode(field: DetailFieldVM): VNode {
  const display = field.display;
  const props = { class: fieldClass(field), ...(field.design.main.style ? { style: field.design.main.style } : {}) };
  const value = typeof display !== 'string' && display.kind === 'html'
    ? h('dd', { ...props, innerHTML: display.html })
    : h('dd', props, [cellDisplayVNode(display)]);
  return h('div', { class: 'detail-field' }, [h('dt', { class: 'detail-label' }, field.label), value]);
}

/** Render an evaluated read-only detail model without data access or evaluation. */
export function Detail(vm: DetailViewModel): VNode {
  return h('dl', {
    class: ['detail-view', vm.design.wrapper.class].filter((value) => value && value.trim()).join(' ').trim(),
    ...(vm.design.wrapper.style ? { style: vm.design.wrapper.style } : {}),
  }, vm.fields.map(fieldVNode));
}
