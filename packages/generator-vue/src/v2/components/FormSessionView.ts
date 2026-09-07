import { defineComponent, h, onMounted, onBeforeUnmount, onUpdated, shallowRef, watch, type PropType } from 'vue';
import { connectForm, type FormSession } from '@polyspec/generator-core';
import { fieldVNode } from './Field';

/** The interactive adapter over a shared, data-independent form template. */
export const FormSessionView = defineComponent({
  name: 'FormSessionView',
  props: {
    /** Editable form instance. */
    session: {
      /** FormSession object. */
      type: Object as PropType<FormSession>,
      /** A form instance is required. */
      required: true,
    },
  },
  setup(props) {
    const root = shallowRef<HTMLElement>();
    const snapshot = shallowRef(props.session.getSnapshot());
    let binding: ReturnType<typeof connectForm> | undefined;
    let unsubscribe: (() => void) | undefined;
    const subscribe = () => {
      unsubscribe?.();
      unsubscribe = props.session.subscribe(() => { snapshot.value = props.session.getSnapshot(); });
      snapshot.value = props.session.getSnapshot();
    };
    subscribe();
    onMounted(() => { binding = connectForm(root.value!, props.session); });
    watch(() => props.session, () => {
      binding?.disconnect();
      subscribe();
      if (root.value) binding = connectForm(root.value, props.session);
    });
    onUpdated(() => { binding?.sync(); });
    onBeforeUnmount(() => { binding?.disconnect(); unsubscribe?.(); });
    return () => h('div', { class: 'form-group', ref: root }, snapshot.value.fields.map(fieldVNode));
  },
});
