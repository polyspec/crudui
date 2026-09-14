import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import { renderDataPanel, renderFormView, renderOutlineView } from '#html';

const emptyView = { collapsed: new Set(), canUndo: false };

export function mountView(element, template, language, data = {}) {
  const messages = formMessages(language);
  const load = (next, view = emptyView) => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    element.innerHTML = renderFormView(fields, bindButtons(template, next, { language }), messages)
      + renderOutlineView({ fields, canUndo: view.canUndo }, messages)
      + renderDataPanel(next, messages);
  };
  load(data);
  return { load, dispose: () => element.replaceChildren() };
}
