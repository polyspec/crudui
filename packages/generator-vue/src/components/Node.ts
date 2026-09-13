/**
 * CRUDUI Vue node renderer: one vnode builder for the recursive form grammar.
 *
 * Every node renders `crudui-node crudui-node--{kind}` with the shared
 * `__header`, `__body` and `__footer` slots, matching the framework-independent
 * HTML renderer. Widgets with opaque behavior attributes use the raw widget path.
 */

import { h, type VNode } from 'vue';
import type { ControlsVM, NodeVM } from '@crudui/generator-core';
import { Widget, widgetRootRaw } from './Widget';

function classes(...parts: Array<string | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

/** One control group of `data-crudui-action` buttons. */
export function controlsVNode(controls: ControlsVM): VNode {
  return h('div', { class: 'crudui-controls', role: 'group', 'aria-label': controls.label },
    controls.actions.map((action) => h('button', {
      key: action.name,
      type: 'button',
      class: 'crudui-action',
      'data-crudui-action': action.name,
      'aria-label': action.label,
      disabled: action.disabled,
    })));
}

function headerVNode(vm: NodeVM): VNode | null {
  const header = vm.header;
  const parts: VNode[] = [];
  if (vm.collapsible) {
    parts.push(h('button', {
      type: 'button',
      class: 'crudui-action',
      'data-crudui-action': 'toggle-row',
      'aria-expanded': vm.expanded === true ? 'true' : 'false',
      'aria-controls': vm.body.id,
      'aria-label': vm.toggleLabel,
    }));
  }
  if (header?.label !== undefined) {
    parts.push(header.labelFor
      ? h('label', { class: 'crudui-node__label', for: header.labelFor }, header.label)
      : h('span', { class: 'crudui-node__label' }, header.label));
  }
  if (header?.description !== undefined) parts.push(h('p', { class: 'crudui-node__description' }, header.description));
  if (header?.number !== undefined) parts.push(h('span', { class: 'crudui-node__number' }, header.number));
  if (header?.title !== undefined) parts.push(h('span', { class: 'crudui-node__title' }, header.title));
  if (header?.summary !== undefined) {
    parts.push(h('span', { class: 'crudui-node__summary', hidden: vm.expanded === true }, header.summary));
  }
  if (header?.count !== undefined) parts.push(h('span', { class: 'crudui-node__count' }, header.count));
  if (vm.controls?.placement === 'header') parts.push(controlsVNode(vm.controls));
  if (!parts.length) return null;
  return h('div', { class: classes('crudui-node__header', header?.className), ...(header?.style ? { style: header.style } : {}) }, parts);
}

function bodyVNode(vm: NodeVM): VNode {
  const props: Record<string, unknown> = {
    class: classes('crudui-node__body', vm.body.className),
    ...(vm.body.style ? { style: vm.body.style } : {}),
    ...(vm.body.id ? { id: vm.body.id } : {}),
    hidden: vm.collapsible === true && vm.expanded !== true,
  };
  if (vm.checkbox) {
    const box = vm.checkbox;
    return h('div', props, [
      h('input', { class: box.className, id: box.id, name: box.name, type: 'checkbox', value: '1', ...(box.checked ? { checked: true } : {}) }),
      h('label', { for: box.id }, box.caption),
    ]);
  }
  if (vm.widget) {
    const raw = widgetRootRaw(vm.widget);
    if (raw !== null) return h('div', { ...props, innerHTML: raw });
    return h('div', props, [Widget(vm.widget)]);
  }
  return h('div', props, (vm.children ?? []).map((child) => nodeVNode(child)));
}

/** Build the vnode for one node of the recursive form grammar. */
export function nodeVNode(vm: NodeVM): VNode {
  const pathAttribute = vm.kind === 'row' || vm.kind === 'lang-item' ? undefined : vm.path;
  const rootStyle = [vm.style, vm.sticky ? `--crudui-sticky-depth: ${vm.stickyDepth ?? 0}` : undefined].filter(Boolean).join('; ');
  return h('div', {
    key: vm.key ?? vm.path ?? vm.lang,
    class: classes('crudui-node', `crudui-node--${vm.kind}`, vm.sticky && 'crudui-node--sticky', vm.className),
    ...(rootStyle ? { style: rootStyle } : {}),
    ...(pathAttribute !== undefined ? { 'data-field-path': pathAttribute } : {}),
    ...(vm.key !== undefined ? { 'data-crudui-row-key': vm.key } : {}),
    ...(vm.lang !== undefined ? { 'data-lang': vm.lang } : {}),
    hidden: vm.hidden,
  }, [
    headerVNode(vm),
    bodyVNode(vm),
    vm.controls?.placement === 'footer' ? h('div', { class: 'crudui-node__footer' }, [controlsVNode(vm.controls)]) : null,
  ]);
}
