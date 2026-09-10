import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createForm } from '@crudui/generator-core';
import { Form } from '#react/Form';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const root = createRoot(element);
  flushSync(() => root.render(<Form form={session} />));
  return {
    getData: () => session.getData(),
    load: next => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: () => flushSync(() => root.unmount()),
    session, template, fromSerializedTemplate: true,
  };
}
