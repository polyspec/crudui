import { flushSync, mount, unmount } from 'svelte';
import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import FormFields from '#svelte/FormFields.svelte';
import OutlineView from '#svelte/OutlineView.svelte';
import DataPanel from '#svelte/DataPanel.svelte';

/**
 * Svelte hydration reads the markers its own server renderer writes (`<!--[-->`), which the form
 * servers do not write, so Svelte clears the container and mounts its own nodes instead.
 */
export const hydration = 'replace';

const emptyView = { collapsed: new Set(), canUndo: false };

function start(views, template, language, data, hydrate) {
  const messages = formMessages(language);
  const evaluate = (next, view) => ({
    fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
    data: next, canUndo: view.canUndo,
  });
  // Components read the current binding through props, so a new binding renders them again.
  let current = $state.raw(evaluate(data, emptyView));
  if (hydrate) views.form.replaceChildren();
  const apps = flushSync(() => [
    mount(FormFields, { target: views.form, props: {
      get fields() { return current.fields; },
      get buttons() { return current.buttons; },
      messages,
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
    load: (next, view = emptyView) => flushSync(() => { current = evaluate(next, view); }),
    dispose: () => { for (const app of apps) unmount(app); },
  };
}

export function mountView(views, template, language, data = {}) {
  return start(views, template, language, data, false);
}

export function hydrateView(views, template, language, data) {
  return start(views, template, language, data, true);
}
