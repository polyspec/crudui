import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type PropType, type ShallowRef, type VNode } from 'vue';
import {
  buildOutline,
  connectOutline,
  type FormConnection,
  type FormInstance,
  type FormMessages,
  type OutlineRow,
  type OutlineState,
} from '@crudui/generator-core';
import { controlsVNode } from './Node';

function textActionVNode(name: string, label: string, disabled = false): VNode {
  return h('button', { type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': name, 'aria-disabled': disabled ? 'true' : undefined }, label);
}

function rowVNode(row: OutlineRow): VNode {
  return h('div', {
    key: row.key,
    class: 'crudui-node crudui-node--row',
    'data-field-path': row.path,
    'data-crudui-row-key': row.key,
  }, [
    h('div', { class: 'crudui-node__header' }, [
      h('button', { type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': 'select-row' }, [
        row.number !== undefined ? h('span', { class: 'crudui-node__number' }, row.number) : null,
        row.title !== undefined ? h('span', { class: 'crudui-node__title' }, row.title) : null,
      ]),
      row.controls ? controlsVNode(row.controls) : null,
    ]),
    row.rows.length ? h('div', { class: 'crudui-node__body' }, row.rows.map(rowVNode)) : null,
  ]);
}

/** Structure map markup for evaluated nodes; applications that own their data render it from `bindForm`. */
export function outlineVNode(state: OutlineState, messages: FormMessages, root?: ShallowRef<HTMLElement | undefined>): VNode {
  return h('div', { class: 'crudui-outline', ...(root ? { ref: root } : {}) }, [
    h('div', { class: 'crudui-outline__header' }, [
      h('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formControls }, [
        textActionVNode('expand-all', messages.expandAll),
        textActionVNode('collapse-all', messages.collapseAll),
        textActionVNode('undo', messages.undo, !state.canUndo),
      ]),
    ]),
    h('div', { class: 'crudui-outline__body' }, buildOutline(state.fields).map(rowVNode)),
  ]);
}

/** Structure map of a form instance with its form controls. */
export const Outline = defineComponent({
  name: 'Outline',
  props: {
    /** Form instance whose rows are mapped. */
    form: {
      /** FormInstance object. */
      type: Object as PropType<FormInstance>,
      /** A form instance is required. */
      required: true,
    },
    /** Rendered form element; selecting a row scrolls it into view. */
    formElement: {
      /** HTMLElement of the rendered form. */
      type: Object as PropType<HTMLElement | null>,
      /** Without a form element, selection does not scroll. */
      default: null,
    },
  },
  setup(props) {
    const root = shallowRef<HTMLElement>();
    const snapshot = shallowRef(props.form.getSnapshot());
    let binding: FormConnection | undefined;
    let unsubscribe = props.form.subscribe(() => { snapshot.value = props.form.getSnapshot(); });
    const connect = () => {
      binding?.disconnect();
      binding = root.value && props.formElement ? connectOutline(root.value, props.form, props.formElement) : undefined;
    };
    onMounted(connect);
    watch(() => [props.form, props.formElement], () => {
      unsubscribe();
      unsubscribe = props.form.subscribe(() => { snapshot.value = props.form.getSnapshot(); });
      snapshot.value = props.form.getSnapshot();
      connect();
    });
    onBeforeUnmount(() => { binding?.disconnect(); unsubscribe(); });
    return () => outlineVNode(snapshot.value, props.form.messages, root);
  },
});
