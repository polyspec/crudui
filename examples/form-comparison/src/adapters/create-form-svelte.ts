import { flushSync, mount, unmount } from 'svelte';
import { createForm } from '@crudui/generator-core';
import CreateFormView from './CreateFormView.svelte';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const app = flushSync(() => mount(CreateFormView, { target: element, props: { form: session, formElement: element } }));
  return {
    getData: () => session.getData(),
    load: next => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: () => unmount(app), session, template, fromSerializedTemplate: true,
  };
}
