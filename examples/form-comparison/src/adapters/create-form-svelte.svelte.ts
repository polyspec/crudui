import { flushSync, mount, unmount } from 'svelte';
import { createForm } from '@polyspec/crudui-generator-core';
import Form from '#svelte/Form.svelte';
import Outline from '#svelte/Outline.svelte';
import DataView from '#svelte/DataView.svelte';
import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { FormViews, RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/**
 * Svelte hydration reads the markers its own server renderer writes (`<!--[-->`), which the form
 * servers do not write, so Svelte clears the container and mounts its own nodes instead.
 */
export const hydration = 'replace';

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const session = createForm(template, data, { language });
  if (hydrate) views.form.replaceChildren();
  const apps = flushSync(() => [
    mount(Form, { target: views.form, props: { form: session } }),
    mount(Outline, { target: views.outline, props: { form: session, formElement: views.form } }),
    mount(DataView, { target: views.data, props: { form: session } }),
  ]);
  return {
    getData: () => session.getData(),
    load: (next: RecordData) => flushSync(() => session.setData(next)),
    idle: () => flushSync(() => {}),
    dispose: async () => { await Promise.all(apps.map(app => unmount(app))); },
    session, template, fromSerializedTemplate: true,
  };
}

export const { mountView, hydrateView } = viewEntries(start);
