import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import { FormFields } from '#react/FormFields';
import { OutlineView } from '#react/Outline';
import { DataPanel } from '#react/DataView';

/** React hydration adopts the server-rendered nodes instead of replacing them. */
export const hydration = 'keep';

const emptyView = { collapsed: new Set(), canUndo: false };

/** Publish the commit of the hydrated or mounted tree, which is not a timed event. */
function Committed({ onCommit, children }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

function start(views, template, language, data, hydrate) {
  const messages = formMessages(language);
  let commit;
  let fail;
  const rendered = new Promise((resolve, reject) => { commit = () => resolve(); fail = reject; });
  const formTree = (fields, next) => (
    <Committed onCommit={commit}>
      <FormFields fields={fields} buttons={bindButtons(template, next, { language })} messages={messages} />
    </Committed>
  );
  const initial = bindForm(template, data, { language, collapsed: emptyView.collapsed });
  const form = hydrate
    ? hydrateRoot(views.form, formTree(initial, data), { onRecoverableError: error => fail(error) })
    : createRoot(views.form);
  const outline = createRoot(views.outline);
  const dataPanel = createRoot(views.data);
  const tools = (fields, next, view) => {
    outline.render(<OutlineView state={{ fields, canUndo: view.canUndo }} messages={messages} />);
    dataPanel.render(<DataPanel data={next} messages={messages} />);
  };
  flushSync(() => {
    if (!hydrate) form.render(formTree(initial, data));
    tools(initial, data, emptyView);
  });
  return {
    rendered,
    load: (next, view = emptyView) => flushSync(() => {
      const fields = bindForm(template, next, { language, collapsed: view.collapsed });
      form.render(formTree(fields, next));
      tools(fields, next, view);
    }),
    dispose: () => flushSync(() => { form.unmount(); outline.unmount(); dataPanel.unmount(); }),
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
