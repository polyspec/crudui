import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createForm } from '@crudui/generator-core';
import { Form } from '#react/Form';
import { Outline } from '#react/Outline';
import { DataView } from '#react/DataView';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const root = createRoot(element);
  // The container holds the form, so selecting a structure map row scrolls its form row into view.
  const formRef = { current: element };
  flushSync(() => root.render(<>
    <Form form={session} />
    <Outline form={session} formRef={formRef} />
    <DataView form={session} />
  </>));
  return {
    getData: () => session.getData(),
    load: next => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: () => flushSync(() => root.unmount()),
    session, template, fromSerializedTemplate: true,
  };
}
