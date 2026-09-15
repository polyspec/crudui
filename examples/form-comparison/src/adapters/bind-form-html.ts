import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import { renderDataPanel, renderFormView, renderOutlineView } from '#html';

/** The markup renderer writes no framework anchors, so it adopts the server-rendered nodes. */
export const hydration = 'keep';

const emptyView = { collapsed: new Set(), canUndo: false };

function start(views, template, language, data, hydrate) {
  const messages = formMessages(language);
  const renderTools = (fields, next, view) => {
    views.outline.innerHTML = renderOutlineView({ fields, canUndo: view.canUndo }, messages);
    views.data.innerHTML = renderDataPanel(next, messages);
  };
  const load = (next, view = emptyView) => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    views.form.innerHTML = renderFormView(fields, bindButtons(template, next, { language }), messages);
    renderTools(fields, next, view);
  };
  // Hydration keeps the server-rendered form and writes only the browser-only views.
  if (hydrate) {
    renderTools(bindForm(template, data, { language, collapsed: emptyView.collapsed }), data, emptyView);
  } else load(data);
  return {
    load,
    dispose: () => {
      for (const view of [views.form, views.outline, views.data]) view.replaceChildren();
    },
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
