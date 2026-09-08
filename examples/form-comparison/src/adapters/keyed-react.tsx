import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '#react/Form';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language, data = {}) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createForm(template, data, { language });
  const root = createRoot(element);
  root.render(<Form form={session} />);
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => root.unmount(), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
