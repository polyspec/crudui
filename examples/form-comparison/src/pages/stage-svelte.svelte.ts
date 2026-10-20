// The canonical page with the Svelte components. Svelte hydrates only markup its own server
// renderer wrote, which carries markers the record servers do not write, so it clears the
// server-rendered view and mounts its own nodes.
import { flushSync, mount, unmount } from 'svelte';
import type { LegacyComponentType } from 'svelte/legacy';
import { buildDetail, buildList, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import Detail from '#svelte/Detail.svelte';
import Form from '#svelte/Form.svelte';
import FormFields from '#svelte/FormFields.svelte';
import List from '#svelte/List.svelte';
import type { BuildDetailOptions, FormInstance, FormTemplate, Language } from '@polyspec/crudui-generator-core';
import { evaluateBinding, type RecordData, type RowView, type StageListOptions } from '../form-views.ts';

/** No row is collapsed when the form starts. */
const initialView: RowView = { collapsed: new Set<string>() };

function start(container: HTMLElement, component: LegacyComponentType, props: Record<string, unknown>, hydrate: boolean) {
  if (hydrate) container.replaceChildren();
  return flushSync(() => mount(component, { target: container, props }));
}

export function list(container: HTMLElement, spec: RecordData, rows: RecordData[], options: StageListOptions, hydrate: boolean) {
  start(container, List, { vm: buildList(spec, rows, options), layout: options.layout }, hydrate);
}

export function detail(container: HTMLElement, spec: RecordData, record: RecordData, options: BuildDetailOptions, hydrate: boolean) {
  start(container, Detail, { vm: buildDetail(spec, record, options) }, hydrate);
}

export function bindFormView(container: HTMLElement, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const evaluate = evaluateBinding(template, language);
  // The component reads the current binding through props, so a new binding renders it again.
  let current = $state.raw(evaluate(data, initialView));
  const app = start(container, FormFields, {
    get fields() { return current.fields; },
    get buttons() { return current.buttons; },
    messages,
    description: formDescription(template, { language }),
  }, hydrate);
  return {
    load: (next: RecordData, view: RowView) => flushSync(() => { current = evaluate(next, view); }),
    dispose: () => unmount(app),
  };
}

export function sessionFormView(container: HTMLElement, session: FormInstance, hydrate: boolean) {
  const app = start(container, Form, { form: session }, hydrate);
  return { dispose: () => unmount(app) };
}
