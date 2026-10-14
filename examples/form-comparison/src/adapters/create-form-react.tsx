import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createForm } from '@polyspec/crudui-generator-core';
import { Form } from '#react/Form';
import { Outline } from '#react/Outline';
import { DataView } from '#react/DataView';
import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { FormViews, RecordData } from '../form-views.ts';

/** React hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

/** Publish the commit of the hydrated or mounted tree, which is not a timed event. */
function Committed({ onCommit, children }: { onCommit: () => void; children: React.ReactNode }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const session = createForm(template, data, { language });
  // The form container holds the form, so selecting a structure map row scrolls its row into view.
  const formRef = { current: views.form };
  const { promise: rendered, resolve, reject: fail } = Promise.withResolvers<void>();
  const commit = () => resolve();
  const tree = <Committed onCommit={commit}><Form form={session} /></Committed>;
  const form = hydrate
    ? hydrateRoot(views.form, tree, { onRecoverableError: (error: unknown) => fail(error) })
    : createRoot(views.form);
  const outline = createRoot(views.outline);
  const dataView = createRoot(views.data);
  flushSync(() => {
    if (!hydrate) form.render(tree);
    outline.render(<Outline form={session} formRef={formRef} />);
    dataView.render(<DataView form={session} />);
  });
  return {
    getData: () => session.getData(),
    load: (next: RecordData) => flushSync(() => session.setData(next)),
    idle: async () => { await rendered; flushSync(() => {}); },
    dispose: () => flushSync(() => { form.unmount(); outline.unmount(); dataView.unmount(); }),
    session, template, fromSerializedTemplate: true,
  };
}

export function mountView(views: FormViews, template: FormTemplate, language: Language, data: RecordData = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views: FormViews, template: FormTemplate, language: Language, data: RecordData) {
  return start(views, template, language, data, true);
}
