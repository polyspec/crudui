import { createApp, createSSRApp, h, nextTick } from 'vue';
import { createForm } from '@crudui/generator-core';
import { Form } from '#vue/Form';
import { Outline } from '#vue/Outline';
import { DataView } from '#vue/DataView';

/** Vue hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

function start(views, template, language, data, hydrate) {
  const session = createForm(template, data, { language });
  const form = (hydrate ? createSSRApp : createApp)({ render: () => h(Form, { form: session }) });
  const outline = createApp({
    render: () => h(Outline, { form: session, formElement: views.form }),
  });
  const dataView = createApp({ render: () => h(DataView, { form: session }) });
  form.mount(views.form, hydrate);
  // The frame owns this container; keep its CSR and SSR container contracts identical.
  views.form.removeAttribute('data-v-app');
  outline.mount(views.outline);
  dataView.mount(views.data);
  return {
    getData: () => session.getData(),
    load: async next => { session.setData(next); await nextTick(); },
    idle: () => nextTick(),
    dispose: () => { form.unmount(); outline.unmount(); dataView.unmount(); },
    session, template, fromSerializedTemplate: true,
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
