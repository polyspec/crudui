import { defineComponent, h, onMounted, onBeforeUnmount, onUpdated, shallowRef, watch, type PropType } from 'vue';
import { connectForm, type FormInstance, type FormRenderOptions } from '@polyspec/crudui-generator-core';
import { formRenderModel } from '@polyspec/crudui-generator-core/internal';
import { FormFields } from './FormFields.js';

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
    /** The complete form options: form element, hidden inputs and errors (form-runtime.md, "Complete form"). */
    options: {
      /** FormRenderOptions object. */
      type: Object as PropType<FormRenderOptions>,
      /** Absent options write the `crudui-form` block alone. */
      required: false,
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
    return () => {
      const model = formRenderModel(snapshot.value.fields, props.form.template.action, props.options);
      const block = FormFields(snapshot.value.fields, snapshot.value.buttons, props.form.messages, root, model, props.form.description);
      if (!model.form) return block;
      return h('form', model.form, [
        ...model.hidden.map(([name, value]) => h('input', { type: 'hidden', name, value })),
        block,
      ]);
    };
  },
});
