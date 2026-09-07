import { createApp, h } from 'vue';
import { compileForm, createFormSession } from '@polyspec/generator-core';
import { FormSessionView } from '#vue/FormSessionView';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createFormSession(template, {}, { language });
  const app = createApp({ render: () => h(FormSessionView, { session }) });
  app.mount(element);
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => app.unmount(), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
