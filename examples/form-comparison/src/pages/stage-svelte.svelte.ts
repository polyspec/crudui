// The canonical page with the Svelte components. Svelte hydrates only markup its own server
// renderer wrote, which carries markers the record servers do not write, so it clears the
// server-rendered view and mounts its own nodes.
import { flushSync, mount, unmount } from 'svelte';
import { bindButtons, bindForm, buildDetail, buildList, formMessages } from '@crudui/generator-core';
import Detail from '#svelte/Detail.svelte';
import Form from '#svelte/Form.svelte';
import FormFields from '#svelte/FormFields.svelte';
import List from '#svelte/List.svelte';

/** No row is collapsed when the form starts. */
const initialView = { collapsed: new Set() };

function start(container, component, props, hydrate) {
  if (hydrate) container.replaceChildren();
  return flushSync(() => mount(component, { target: container, props }));
}

export function list(container, spec, rows, options, hydrate) {
  start(container, List, { vm: buildList(spec, rows, options), layout: options.layout }, hydrate);
}

export function detail(container, spec, record, options, hydrate) {
  start(container, Detail, { vm: buildDetail(spec, record, options) }, hydrate);
}

export function bindFormView(container, template, language, data, hydrate) {
  const messages = formMessages(language);
  const evaluate = (next, view) => ({
    fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
  });
  // The component reads the current binding through props, so a new binding renders it again.
  let current = $state.raw(evaluate(data, initialView));
  const app = start(container, FormFields, {
    get fields() { return current.fields; },
    get buttons() { return current.buttons; },
    messages,
  }, hydrate);
  return {
    load: (next, view) => flushSync(() => { current = evaluate(next, view); }),
    dispose: () => unmount(app),
  };
}

export function sessionFormView(container, session, hydrate) {
  const app = start(container, Form, { form: session }, hydrate);
  return { dispose: () => unmount(app) };
}
