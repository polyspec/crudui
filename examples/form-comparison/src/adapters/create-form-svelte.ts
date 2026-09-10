import { mount, unmount } from 'svelte';
import { createForm } from '@crudui/generator-core';
import Form from '#svelte/Form.svelte';

export function mountView(element, template, language, data = {}) {
  const session = createForm(template, data, { language });
  const app = mount(Form, { target: element, props: { form: session } });
  return {
    getData: () => session.getData(), load: next => session.setData(next),
    dispose: () => unmount(app), session, template, fromSerializedTemplate: true,
  };
}
