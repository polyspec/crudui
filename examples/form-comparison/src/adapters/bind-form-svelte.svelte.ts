import { flushSync, mount, unmount } from 'svelte';
import { bindButtons, bindForm, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import FormFields from '#svelte/FormFields.svelte';
import OutlineView from '#svelte/OutlineView.svelte';
import DataPanel from '#svelte/DataPanel.svelte';
import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import { emptyView, type BindView, type FormViews, type RecordData } from '../form-views.ts';
import { viewEntries } from './view-entries.ts';

/**
 * Svelte hydration reads the markers its own server renderer writes (`<!--[-->`), which the form
 * servers do not write, so Svelte clears the container and mounts its own nodes instead.
 */
export const hydration = 'replace';

function start(views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const evaluate = (next: RecordData, view: BindView) => ({
    fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
    data: next, canUndo: view.canUndo, canRedo: false,
  });
  // Components read the current binding through props, so a new binding renders them again.
  let current = $state.raw(evaluate(data, emptyView));
  if (hydrate) views.form.replaceChildren();
  const apps = flushSync(() => [
    mount(FormFields, { target: views.form, props: {
      get fields() { return current.fields; },
      get buttons() { return current.buttons; },
      messages,
      description: formDescription(template, { language }),
    } }),
    mount(OutlineView, { target: views.outline, props: {
      get state() { return current; },
      messages,
    } }),
    mount(DataPanel, { target: views.data, props: {
      get data() { return current.data; },
      messages,
    } }),
  ]);
  return {
    load: (next: RecordData, view: BindView = emptyView) => flushSync(() => { current = evaluate(next, view); }),
    dispose: async () => { await Promise.all(apps.map(app => unmount(app))); },
  };
}

export const { mountView, hydrateView } = viewEntries(start);
