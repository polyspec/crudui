// The canonical page with the framework-independent HTML renderer. The renderer writes no
// framework anchors, so it adopts server-rendered markup as it is.
import { bindButtons, bindForm, connectForm, formMessages, patchContent } from '@crudui/generator-core';
import { renderDetail, renderForm, renderFormView, renderList } from '#html';

export function list(container, spec, rows, options, hydrate) {
  if (!hydrate) patchContent(container, renderList(spec, rows, options));
}

export function detail(container, spec, record, options, hydrate) {
  if (!hydrate) patchContent(container, renderDetail(spec, record, options));
}

/** The bindForm renderer: every binding is rendered as markup and patched into the form. */
export function bindFormView(container, template, language, data, hydrate) {
  const messages = formMessages(language);
  const load = (next, view) => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    patchContent(container, renderFormView(fields, bindButtons(template, next, { language }), messages));
  };
  if (!hydrate) load(data, { collapsed: new Set() });
  return { load, dispose: () => container.replaceChildren() };
}

/** The createForm renderer: the session is rendered again on every change and patched. */
export function sessionFormView(container, session, hydrate) {
  const render = () => patchContent(container, renderForm(session));
  if (!hydrate) render();
  const connection = connectForm(container, session);
  const unsubscribe = session.subscribe(() => {
    render();
    connection.sync();
  });
  return {
    dispose: () => {
      unsubscribe();
      connection.disconnect();
      container.replaceChildren();
    },
  };
}
