// The canonical page with the Vue components. An SSR application hydrates the server-rendered
// nodes; a CSR application mounts its own.
import { createApp, createSSRApp, h, nextTick, shallowRef } from 'vue';
import { bindButtons, bindForm, buildDetail, buildList, formMessages } from '@crudui/generator-core';
import { Detail } from '#vue/Detail';
import { Form } from '#vue/Form';
import { FormFields } from '#vue/FormFields';
import { List } from '#vue/List';

function start(container, render, hydrate) {
  const app = (hydrate ? createSSRApp : createApp)({ render });
  app.mount(container);
  return app;
}

export function list(container, spec, rows, options, hydrate) {
  const vm = buildList(spec, rows, options);
  start(container, () => List(vm, options.layout), hydrate);
  return nextTick();
}

export function detail(container, spec, record, options, hydrate) {
  const vm = buildDetail(spec, record, options);
  start(container, () => Detail(vm), hydrate);
  return nextTick();
}

export function bindFormView(container, template, language, data, hydrate) {
  const messages = formMessages(language);
  const evaluate = (next, view) => ({
    fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
  });
  const state = shallowRef(evaluate(data, { collapsed: new Set() }));
  const app = start(container, () => FormFields(state.value.fields, state.value.buttons, messages), hydrate);
  return {
    rendered: nextTick(),
    load: (next, view) => {
      state.value = evaluate(next, view);
      return nextTick();
    },
    dispose: () => app.unmount(),
  };
}

export function sessionFormView(container, session, hydrate) {
  const app = start(container, () => h(Form, { form: session }), hydrate);
  return { rendered: nextTick(), dispose: () => app.unmount() };
}
