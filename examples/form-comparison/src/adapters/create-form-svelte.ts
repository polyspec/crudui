import { flushSync, mount, unmount } from 'svelte';
import { createForm } from '@crudui/generator-core';
import Form from '#svelte/Form.svelte';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const app = flushSync(() => mount(Form, { target: element, props: { form: session } }));
  return {
    getData: () => session.getData(),
    load: next => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: () => unmount(app), session, template, fromSerializedTemplate: true,
  };
}
