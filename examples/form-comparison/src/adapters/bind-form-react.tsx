import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { bindButtons, bindForm, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import { FormFields } from '#react/FormFields';
import { OutlineView } from '#react/Outline';
import { DataPanel } from '#react/DataView';
import type { FormTemplate, Language, NodeVM } from '@polyspec/crudui-generator-core';
import { emptyView, type BindView, type FormViews, type RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/** React hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

/** Publish the commit of the hydrated or mounted tree, which is not a timed event. */
function Committed({ onCommit, children }: { onCommit: () => void; children: React.ReactNode }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const description = formDescription(template, { language });
  const { promise: rendered, resolve, reject: fail } = Promise.withResolvers<void>();
  const commit = () => resolve();
  const formTree = (fields: NodeVM[], next: RecordData) => (
    <Committed onCommit={commit}>
      <FormFields fields={fields} buttons={bindButtons(template, next, { language })} messages={messages} description={description} />
    </Committed>
  );
  const initial = bindForm(template, data, { language, collapsed: emptyView.collapsed });
  const form = hydrate
    ? hydrateRoot(views.form, formTree(initial, data), { onRecoverableError: (error: unknown) => fail(error) })
    : createRoot(views.form);
  const outline = createRoot(views.outline);
  const dataPanel = createRoot(views.data);
  const tools = (fields: NodeVM[], next: RecordData, view: BindView) => {
    outline.render(<OutlineView state={{ fields, canUndo: view.canUndo, canRedo: false }} messages={messages} />);
    dataPanel.render(<DataPanel data={next} messages={messages} />);
  };
  flushSync(() => {
    if (!hydrate) form.render(formTree(initial, data));
    tools(initial, data, emptyView);
  });
  return {
    rendered,
    load: (next: RecordData, view: BindView = emptyView) => flushSync(() => {
      const fields = bindForm(template, next, { language, collapsed: view.collapsed });
      form.render(formTree(fields, next));
      tools(fields, next, view);
    }),
    dispose: () => flushSync(() => { form.unmount(); outline.unmount(); dataPanel.unmount(); }),
  };
}

export const { mountView, hydrateView } = viewEntries(start);
