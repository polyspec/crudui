import { createApp, h, nextTick } from 'vue';
import { createForm } from '@crudui/generator-core';
import { Form } from '#vue/Form';
import { Outline } from '#vue/Outline';
import { DataView } from '#vue/DataView';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const app = createApp({
    render: () => [
      h(Form, { form: session }),
      h(Outline, { form: session, formElement: element }),
      h(DataView, { form: session }),
    ],
  });
  app.mount(element);
  return {
    getData: () => session.getData(),
    load: async next => { session.setData(next); await nextTick(); },
    idle: () => nextTick(),
    dispose: () => app.unmount(), session, template, fromSerializedTemplate: true,
  };
}
