import { bindButtons, bindForm, formDescription, formMessages, patchContent } from '@polyspec/crudui-generator-core';
import type { FormTemplate, Language, NodeVM } from '@polyspec/crudui-generator-core';
import { renderDataPanel, renderFormView, renderOutlineView } from '#html';
import { emptyView, type BindView, type FormViews, type RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/** The markup renderer writes no framework anchors, so it adopts the server-rendered nodes. */
export const hydration = 'keep';

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const renderTools = (fields: NodeVM[], next: RecordData, view: BindView) => {
    patchContent(views.outline, renderOutlineView({ fields, canUndo: view.canUndo, canRedo: false }, messages));
    patchContent(views.data, renderDataPanel(next, messages));
  };
  const load = (next: RecordData, view: BindView = emptyView) => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    patchContent(views.form, renderFormView(fields, bindButtons(template, next, { language }), messages, undefined, formDescription(template, { language })));
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

export const { mountView, hydrateView } = viewEntries(start);
