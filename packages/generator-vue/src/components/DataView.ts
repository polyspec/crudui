import { defineComponent, h, onBeforeUnmount, shallowRef, watch, type PropType, type VNode } from 'vue';
import type { FormInstance, FormMessages } from '@crudui/generator-core';

/** Current data markup; applications that own their data render it directly. */
export function dataVNode(data: unknown, messages: FormMessages): VNode {
  return h('div', { class: 'crudui-data' }, [
    h('div', { class: 'crudui-data__header' }, messages.data),
    h('pre', { class: 'crudui-data__body' }, JSON.stringify(data, null, 2)),
  ]);
}

/** Current submission data of a form instance. */
export const DataView = defineComponent({
  name: 'DataView',
  props: {
    /** Form instance whose data is shown. */
    form: {
      /** FormInstance object. */
      type: Object as PropType<FormInstance>,
      /** A form instance is required. */
      required: true,
    },
  },
  setup(props) {
    const snapshot = shallowRef(props.form.getSnapshot());
    let unsubscribe = props.form.subscribe(() => { snapshot.value = props.form.getSnapshot(); });
    watch(() => props.form, () => {
      unsubscribe();
      unsubscribe = props.form.subscribe(() => { snapshot.value = props.form.getSnapshot(); });
      snapshot.value = props.form.getSnapshot();
    });
    onBeforeUnmount(() => unsubscribe());
    return () => {
      void snapshot.value;
      return dataVNode(props.form.getData(), props.form.messages);
    };
  },
});
