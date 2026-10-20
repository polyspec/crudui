// The canonical page with the Vue components. An SSR application hydrates the server-rendered
// nodes; a CSR application mounts its own.
import { createApp, createSSRApp, h, nextTick, shallowRef } from 'vue';
import { buildDetail, buildList, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import { failOnErrors } from '../vue-errors.mjs';
import { Detail } from '#vue/Detail';
import { Form } from '#vue/Form';
import { FormFields } from '#vue/FormFields';
import { List } from '#vue/List';
import type { BuildDetailOptions, FormInstance, FormTemplate, Language } from '@polyspec/crudui-generator-core';
import { evaluateBinding, type RecordData, type RowView, type StageListOptions } from '../form-views.ts';
import type { VNode } from 'vue';

function start(container: HTMLElement, render: () => VNode, hydrate: boolean) {
  const app = (hydrate ? createSSRApp : createApp)({ render });
  failOnErrors(app);
  app.mount(container);
  return app;
}

export function list(container: HTMLElement, spec: RecordData, rows: RecordData[], options: StageListOptions, hydrate: boolean) {
  const vm = buildList(spec, rows, options);
  start(container, () => List(vm, options.layout), hydrate);
  return nextTick();
}

export function detail(container: HTMLElement, spec: RecordData, record: RecordData, options: BuildDetailOptions, hydrate: boolean) {
  const vm = buildDetail(spec, record, options);
  start(container, () => Detail(vm), hydrate);
  return nextTick();
}

export function bindFormView(container: HTMLElement, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const evaluate = evaluateBinding(template, language);
  const state = shallowRef(evaluate(data, { collapsed: new Set<string>() }));
  const app = start(container, () => FormFields(state.value.fields, state.value.buttons, messages, undefined, undefined, formDescription(template, { language })), hydrate);
  return {
    rendered: nextTick(),
    load: (next: RecordData, view: RowView) => {
      state.value = evaluate(next, view);
      return nextTick();
    },
    dispose: () => app.unmount(),
  };
}

export function sessionFormView(container: HTMLElement, session: FormInstance, hydrate: boolean) {
  const app = start(container, () => h(Form, { form: session }), hydrate);
  return { rendered: nextTick(), dispose: () => app.unmount() };
}
