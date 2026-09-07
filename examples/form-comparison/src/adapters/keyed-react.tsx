import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { compileForm, createFormSession } from '@polyspec/generator-core';
import { FormSessionView } from '#react/FormSessionView';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createFormSession(template, {}, { language });
  const root = createRoot(element);
  root.render(<FormSessionView session={session} />);
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => root.unmount(), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
