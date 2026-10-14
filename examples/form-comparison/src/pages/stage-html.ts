// The canonical page with the framework-independent HTML renderer. The renderer writes no
// framework anchors, so it adopts server-rendered markup as it is.
import { bindButtons, bindForm, connectForm, formDescription, formMessages, patchContent } from '@polyspec/crudui-generator-core';
import { renderDetail, renderForm, renderFormView, renderList } from '#html';
import type { BuildDetailOptions, FormInstance, FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { RecordData, RowView, StageListOptions } from '../form-views.ts';

export function list(container: HTMLElement, spec: RecordData, rows: RecordData[], options: StageListOptions, hydrate: boolean) {
  if (!hydrate) patchContent(container, renderList(spec, rows, options));
}

export function detail(container: HTMLElement, spec: RecordData, record: RecordData, options: BuildDetailOptions, hydrate: boolean) {
  if (!hydrate) patchContent(container, renderDetail(spec, record, options));
}

/** The bindForm renderer: every binding is rendered as markup and patched into the form. */
export function bindFormView(container: HTMLElement, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const load = (next: RecordData, view: RowView) => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    patchContent(container, renderFormView(fields, bindButtons(template, next, { language }), messages, undefined, formDescription(template, { language })));
  };
  if (!hydrate) load(data, { collapsed: new Set<string>() });
  return { load, dispose: () => container.replaceChildren() };
}

/** The createForm renderer: the session is rendered again on every change and patched. */
export function sessionFormView(container: HTMLElement, session: FormInstance, hydrate: boolean) {
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
