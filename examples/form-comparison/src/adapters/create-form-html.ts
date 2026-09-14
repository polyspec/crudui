import { connectForm, createForm } from '@crudui/generator-core';
import { renderData, renderForm, renderOutline } from '#html';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  // The HTML renderer returns markup: the container is rendered again on every change, and
  // one browser binding runs the actions of the form and of the structure map inside it.
  const render = () => {
    element.innerHTML = renderForm(session) + renderOutline(session) + renderData(session);
  };
  render();
  // Connected before the rendering subscription, so the binding records focus before a render.
  const connection = connectForm(element, session);
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
      element.replaceChildren();
    },
    session, template, fromSerializedTemplate: true,
  };
}
