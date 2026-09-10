import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { bindForm } from '@crudui/generator-core';
import { FormFields } from '#react/FormFields';

export function mountView(element, template, language, data = {}) {
  const root = createRoot(element);
  const load = next => flushSync(() => root.render(
    <FormFields fields={bindForm(template, next, { language })} />,
  ));
  load(data);
  return { load, dispose: () => root.unmount() };
}
