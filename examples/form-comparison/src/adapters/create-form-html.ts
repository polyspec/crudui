import { connectForm, connectOutline, createForm } from '@crudui/generator-core';
import { renderData, renderForm, renderOutline } from '#html';

/** The markup renderer writes no framework anchors, so it adopts the server-rendered nodes. */
export const hydration = 'keep';

function start(views, template, language, data, hydrate) {
  const session = createForm(template, data, { language });
  // The HTML renderer returns markup: every view is rendered again on every change, and browser
  // bindings run the actions of the form and of the structure map beside it.
  const renderTools = () => {
    views.outline.innerHTML = renderOutline(session);
    views.data.innerHTML = renderData(session);
  };
  const render = () => {
    views.form.innerHTML = renderForm(session);
    renderTools();
  };
  // Hydration keeps the server-rendered form and writes only the browser-only views.
  if (hydrate) renderTools();
  else render();
  // Connected before the rendering subscription, so the binding records focus before a render.
  const connection = connectForm(views.form, session);
  const outlineConnection = connectOutline(views.outline, session, views.form);
  const unsubscribe = session.subscribe(() => {
    render();
    connection.sync();
  });
  return {
    getData: () => session.getData(),
    load: next => session.setData(next),
    idle: () => Promise.resolve(),
    dispose: () => {
      unsubscribe();
      connection.disconnect();
      outlineConnection.disconnect();
      for (const view of [views.form, views.outline, views.data]) view.replaceChildren();
    },
    session, template, fromSerializedTemplate: true,
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
