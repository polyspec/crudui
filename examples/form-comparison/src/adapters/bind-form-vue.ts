import { createApp, nextTick, shallowRef } from 'vue';
import { bindForm } from '@crudui/generator-core';
import { FormFields } from '#vue/FormFields';

export function mountView(element, template, language, data = {}) {
  const fields = shallowRef(bindForm(template, data, { language }));
  const app = createApp({ render: () => FormFields(fields.value) });
  app.mount(element);
  return {
    load: next => { fields.value = bindForm(template, next, { language }); return nextTick(); },
    dispose: () => app.unmount(),
  };
}
