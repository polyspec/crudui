import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type PropType, type VNode } from 'vue';
import {
  buildOutline,
  connectOutline,
  type FormConnection,
  type FormInstance,
  type OutlineCollection,
  type OutlineRow,
} from '@crudui/generator-core';
import { controlsVNode } from './Node';

function textActionVNode(name: string, label: string, disabled = false): VNode {
  return h('button', { type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': name, disabled }, label);
}

function collectionVNode(collection: OutlineCollection): VNode {
  return h('div', { key: collection.path, class: 'crudui-node crudui-node--collection', 'data-field-path': collection.path }, [
    h('div', { class: 'crudui-node__header' }, [
      collection.label !== undefined ? h('span', { class: 'crudui-node__label' }, collection.label) : null,
      collection.count !== undefined ? h('span', { class: 'crudui-node__count' }, collection.count) : null,
      collection.controls ? controlsVNode(collection.controls) : null,
    ]),
    h('div', { class: 'crudui-node__body' }, collection.rows.map(rowVNode)),
  ]);
}

function rowVNode(row: OutlineRow): VNode {
  return h('div', {
    key: row.key,
    class: 'crudui-node crudui-node--row',
    'data-field-path': row.path,
    'data-crudui-row-key': row.key,
    ...(row.current ? { 'aria-current': 'true' } : {}),
  }, [
    h('div', { class: 'crudui-node__header' }, [
      h('button', { type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': 'select-row' }, [
        row.number !== undefined ? h('span', { class: 'crudui-node__number' }, row.number) : null,
        row.title !== undefined ? h('span', { class: 'crudui-node__title' }, row.title) : null,
      ]),
      row.controls ? controlsVNode(row.controls) : null,
    ]),
    row.collections.length ? h('div', { class: 'crudui-node__body' }, row.collections.map(collectionVNode)) : null,
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
    return () => {
      const messages = props.form.messages;
      return h('div', { class: 'crudui-outline', ref: root }, [
        h('div', { class: 'crudui-outline__header' }, [
          h('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formControls }, [
            textActionVNode('expand-all', messages.expandAll),
            textActionVNode('collapse-all', messages.collapseAll),
            textActionVNode('undo', messages.undo, !snapshot.value.canUndo),
          ]),
        ]),
        h('div', { class: 'crudui-outline__body' },
          buildOutline(snapshot.value.fields, snapshot.value.selection).map(collectionVNode)),
      ]);
    };
  },
});
