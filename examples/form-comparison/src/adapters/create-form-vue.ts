import { createApp, createSSRApp, h, nextTick } from 'vue';
import { createForm } from '@polyspec/crudui-generator-core';
import { Form } from '#vue/Form';
import { Outline } from '#vue/Outline';
import { DataView } from '#vue/DataView';
import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { FormViews, RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/** Vue hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const session = createForm(template, data, { language });
  const form = (hydrate ? createSSRApp : createApp)({ render: () => h(Form, { form: session }) });
  const outline = createApp({
    render: () => h(Outline, { form: session, formElement: views.form }),
  });
  const dataView = createApp({ render: () => h(DataView, { form: session }) });
  form.mount(views.form, hydrate);
  outline.mount(views.outline);
  dataView.mount(views.data);
  return {
    getData: () => session.getData(),
    load: async (next: RecordData) => { session.setData(next); await nextTick(); },
    idle: () => nextTick(),
    dispose: () => { form.unmount(); outline.unmount(); dataView.unmount(); },
    session, template, fromSerializedTemplate: true,
  };
}

export const { mountView, hydrateView } = viewEntries(start);
