import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { bindForm, formMessages } from '@crudui/generator-core';
import { FormFields } from '#react/FormFields';
import { OutlineView } from '#react/Outline';
import { DataPanel } from '#react/DataView';

const emptyView = { collapsed: new Set(), canUndo: false };

export function mountView(element, template, language, data = {}) {
  const root = createRoot(element);
  const messages = formMessages(language);
  const load = (next, view = emptyView) => flushSync(() => {
    const fields = bindForm(template, next, { language, collapsed: view.collapsed });
    root.render(<>
      <FormFields fields={fields} />
      <OutlineView state={{ fields, selection: view.selection, canUndo: view.canUndo }} messages={messages} />
      <DataPanel data={next} messages={messages} />
    </>);
  });
  load(data);
  return { load, dispose: () => root.unmount() };
}
