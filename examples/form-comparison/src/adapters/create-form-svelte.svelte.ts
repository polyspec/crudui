import { flushSync, mount, unmount } from 'svelte';
import { createForm } from '@crudui/generator-core';
import Form from '#svelte/Form.svelte';
import Outline from '#svelte/Outline.svelte';
import DataView from '#svelte/DataView.svelte';

/**
 * Svelte hydration reads the markers its own server renderer writes (`<!--[-->`), which the form
 * servers do not write, so Svelte clears the container and mounts its own nodes instead.
 */
export const hydration = 'replace';

function start(views, template, language, data, hydrate) {
  const session = createForm(template, data, { language });
  if (hydrate) views.form.replaceChildren();
  const apps = flushSync(() => [
    mount(Form, { target: views.form, props: { form: session } }),
    mount(Outline, { target: views.outline, props: { form: session, formElement: views.form } }),
    mount(DataView, { target: views.data, props: { form: session } }),
  ]);
  return {
    getData: () => session.getData(),
    load: next => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: () => { for (const app of apps) unmount(app); },
    session, template, fromSerializedTemplate: true,
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
