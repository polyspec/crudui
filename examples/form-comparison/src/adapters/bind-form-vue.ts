import { createApp, createSSRApp, nextTick, shallowRef } from 'vue';
import { bindButtons, bindForm, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import { FormFields } from '#vue/FormFields';
import { outlineVNode } from '#vue/Outline';
import { dataVNode } from '#vue/DataView';
import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import { emptyView, type BindView, type FormViews, type RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/** Vue hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const evaluate = (next: RecordData, view: BindView) => ({
    data: next, view, fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
  });
  const state = shallowRef(evaluate(data, emptyView));
  const form = (hydrate ? createSSRApp : createApp)({
    render: () => FormFields(state.value.fields, state.value.buttons, messages, undefined, undefined, formDescription(template, { language })),
  });
  const outline = createApp({
    render: () => outlineVNode({ fields: state.value.fields, canUndo: state.value.view.canUndo, canRedo: false }, messages),
  });
  const dataPanel = createApp({ render: () => dataVNode(state.value.data, messages) });
  form.mount(views.form, hydrate);
  outline.mount(views.outline);
  dataPanel.mount(views.data);
  return {
    load: (next: RecordData, view: BindView = emptyView) => {
      state.value = evaluate(next, view);
      return nextTick();
    },
    dispose: () => { form.unmount(); outline.unmount(); dataPanel.unmount(); },
  };
}

export const { mountView, hydrateView } = viewEntries(start);
