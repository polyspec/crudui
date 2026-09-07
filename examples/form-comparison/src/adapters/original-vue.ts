import { createApp, shallowRef, nextTick } from 'vue';
import { originalBinding } from '../original-binding.mjs';
import { FormV2 } from '#vue/FormV2';

export function mountView(element, spec, language) {
  const binding = originalBinding(spec, language);
  const fields = shallowRef(binding.build({}));
  const app = createApp({ render: () => FormV2(fields.value) });
  app.mount(element);
  return {
    ...binding,
    load: (data) => { fields.value = binding.build(data); return nextTick(); },
    dispose: () => app.unmount(),
  };
}
