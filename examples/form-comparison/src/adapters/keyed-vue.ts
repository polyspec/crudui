import { createApp, h } from 'vue';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '#vue/Form';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language, data = {}) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createForm(template, data, { language });
  const app = createApp({ render: () => h(Form, { form: session }) });
  app.mount(element);
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => app.unmount(), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
