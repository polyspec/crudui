import { mount, unmount } from 'svelte';
import { compileForm, createForm } from '@crudui/generator-core';
import Form from '#svelte/Form.svelte';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language, data = {}) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createForm(template, data, { language });
  const app = mount(Form, { target: element, props: { form: session } });
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => unmount(app), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
