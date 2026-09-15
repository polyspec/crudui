import { createApp, createSSRApp, nextTick, shallowRef } from 'vue';
import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import { FormFields } from '#vue/FormFields';
import { outlineVNode } from '#vue/Outline';
import { dataVNode } from '#vue/DataView';

/** Vue hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

const emptyView = { collapsed: new Set(), canUndo: false };

function start(views, template, language, data, hydrate) {
  const messages = formMessages(language);
  const evaluate = (next, view) => ({
    data: next, view, fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
  });
  const state = shallowRef(evaluate(data, emptyView));
  const form = (hydrate ? createSSRApp : createApp)({
    render: () => FormFields(state.value.fields, state.value.buttons, messages),
  });
  const outline = createApp({
    render: () => outlineVNode({ fields: state.value.fields, canUndo: state.value.view.canUndo }, messages),
  });
  const dataPanel = createApp({ render: () => dataVNode(state.value.data, messages) });
  form.mount(views.form, hydrate);
  // The frame owns this container; keep its CSR and SSR container contracts identical.
  views.form.removeAttribute('data-v-app');
  outline.mount(views.outline);
  dataPanel.mount(views.data);
  return {
    load: (next, view = emptyView) => {
      state.value = evaluate(next, view);
      return nextTick();
    },
    dispose: () => { form.unmount(); outline.unmount(); dataPanel.unmount(); },
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
