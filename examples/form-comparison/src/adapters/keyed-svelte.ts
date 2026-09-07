import { mount, unmount } from 'svelte';
import { compileForm, createFormSession } from '@crudui/generator-core';
import FormSessionView from '#svelte/FormSessionView.svelte';
import { cacheFixture } from '../cache-fixture.mjs';

export function mountView(element, spec, language) {
  const fixture = cacheFixture(spec);
  const template = JSON.parse(JSON.stringify(compileForm(fixture.source, { loader: fixture.loader, keyPrefix: 'form' })));
  fixture.close();
  const session = createFormSession(template, {}, { language });
  const app = mount(FormSessionView, { target: element, props: { session } });
  return { getData: () => session.getData(), load: (data) => session.setData(data), dispose: () => unmount(app), session, template, fromSerializedTemplate: true, referenceReads: fixture.referenceReads };
}
