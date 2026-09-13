import { createApp, nextTick, shallowRef } from 'vue';
import { bindForm, formMessages } from '@crudui/generator-core';
import { FormFields } from '#vue/FormFields';
import { outlineVNode } from '#vue/Outline';
import { dataVNode } from '#vue/DataView';

const emptyView = { collapsed: new Set(), canUndo: false };

export function mountView(element, template, language, data = {}) {
  const messages = formMessages(language);
  const evaluate = (next, view) => ({
    data: next, view, fields: bindForm(template, next, { language, collapsed: view.collapsed }),
  });
  const state = shallowRef(evaluate(data, emptyView));
  const app = createApp({
    render: () => [
      FormFields(state.value.fields),
      outlineVNode({ fields: state.value.fields, selection: state.value.view.selection, canUndo: state.value.view.canUndo }, messages),
      dataVNode(state.value.data, messages),
    ],
  });
  app.mount(element);
  return {
    load: (next, view = emptyView) => {
      state.value = evaluate(next, view);
      return nextTick();
    },
    dispose: () => app.unmount(),
  };
}
