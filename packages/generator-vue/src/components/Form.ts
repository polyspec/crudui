import { defineComponent, onMounted, onBeforeUnmount, onUpdated, shallowRef, watch, type PropType } from 'vue';
import { connectForm, type FormInstance } from '@crudui/generator-core';
import { FormFields } from './FormFields';

/** The interactive adapter over a shared, data-independent form template. */
export const Form = defineComponent({
  name: 'Form',
  props: {
    /** Editable form instance. */
    form: {
      /** FormInstance object. */
      type: Object as PropType<FormInstance>,
      /** A form instance is required. */
      required: true,
    },
  },
  setup(props) {
    const root = shallowRef<HTMLElement>();
    const snapshot = shallowRef(props.form.getSnapshot());
    let binding: ReturnType<typeof connectForm> | undefined;
    let unsubscribe: (() => void) | undefined;
    const subscribe = () => {
      unsubscribe?.();
      unsubscribe = props.form.subscribe(() => { snapshot.value = props.form.getSnapshot(); });
      snapshot.value = props.form.getSnapshot();
    };
    subscribe();
    onMounted(() => { binding = connectForm(root.value!, props.form); });
    watch(() => props.form, () => {
      binding?.disconnect();
      subscribe();
      if (root.value) binding = connectForm(root.value, props.form);
    });
    onUpdated(() => { binding?.sync(); });
    onBeforeUnmount(() => { binding?.disconnect(); unsubscribe?.(); });
    return () => FormFields(snapshot.value.fields, snapshot.value.buttons, props.form.messages, root);
  },
});
