import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createForm } from '@crudui/generator-core';
import { Form } from '#react/Form';
import { Outline } from '#react/Outline';
import { DataView } from '#react/DataView';

/** React hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

/** Publish the commit of the hydrated or mounted tree, which is not a timed event. */
function Committed({ onCommit, children }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

function start(views, template, language, data, hydrate) {
  const session = createForm(template, data, { language });
  // The form container holds the form, so selecting a structure map row scrolls its row into view.
  const formRef = { current: views.form };
  let commit;
  let fail;
  const rendered = new Promise((resolve, reject) => { commit = () => resolve(); fail = reject; });
  const tree = <Committed onCommit={commit}><Form form={session} /></Committed>;
  const form = hydrate
    ? hydrateRoot(views.form, tree, { onRecoverableError: error => fail(error) })
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
    load: next => flushSync(() => session.setData(next)),
    idle: async () => { await rendered; flushSync(() => {}); },
    dispose: () => flushSync(() => { form.unmount(); outline.unmount(); dataView.unmount(); }),
    session, template, fromSerializedTemplate: true,
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
