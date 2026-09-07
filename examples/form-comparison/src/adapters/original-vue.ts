import { createApp, shallowRef, nextTick } from 'vue';
import { originalBinding } from '../original-binding.mjs';
import { Form } from '#vue/Form';

export function mountView(element, spec, language, data = {}) {
  const binding = originalBinding(spec, language);
  const fields = shallowRef(binding.build(data));
  const app = createApp({ render: () => Form(fields.value) });
  app.mount(element);
  return {
    ...binding,
    load: (data) => { fields.value = binding.build(data); return nextTick(); },
    dispose: () => app.unmount(),
  };
}
