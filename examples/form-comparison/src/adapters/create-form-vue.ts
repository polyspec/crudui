import { createApp, h } from 'vue';
import { createForm } from '@crudui/generator-core';
import { Form } from '#vue/Form';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const app = createApp({ render: () => h(Form, { form: session }) });
  app.mount(element);
  return {
    getData: () => session.getData(), load: next => session.setData(next),
    dispose: () => app.unmount(), session, template, fromSerializedTemplate: true,
  };
}
