// The canonical page with the React components. Hydration adopts the server-rendered nodes; a
// mismatch is a recoverable React error, which fails the view.
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { bindButtons, bindForm, buildDetail, buildList, formDescription, formMessages } from '@polyspec/crudui-generator-core';
import { Detail } from '#react/Detail';
import { Form } from '#react/Form';
import { FormFields } from '#react/FormFields';
import { List } from '#react/List';
import type { BuildDetailOptions, FormInstance, FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { RecordData, RowView, StageListOptions } from '../form-views.ts';

/** Publish the commit of the hydrated or mounted tree. */
function Committed({ onCommit, children }: { onCommit: () => void; children: React.ReactNode }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

/** Render `element(commit)` into the container and resolve after React committed it. */
function start(container: HTMLElement, element: React.ReactNode, hydrate: boolean) {
  const { promise: rendered, resolve, reject: fail } = Promise.withResolvers<void>();
  const commit = () => resolve();
  const tree = (content: React.ReactNode) => <Committed onCommit={commit}>{content}</Committed>;
  let root: Root;
  if (hydrate) {
    root = hydrateRoot(container, tree(element), { onRecoverableError: (error: unknown) => fail(error) });
  } else {
    const created = createRoot(container);
    flushSync(() => created.render(tree(element)));
    root = created;
  }
  return { rendered, render: (content: React.ReactNode) => flushSync(() => root.render(tree(content))), root };
}

export function list(container: HTMLElement, spec: RecordData, rows: RecordData[], options: StageListOptions, hydrate: boolean) {
  const vm = buildList(spec, rows, options);
  return start(container, <List vm={vm} layout={options.layout} />, hydrate).rendered;
}

export function detail(container: HTMLElement, spec: RecordData, record: RecordData, options: BuildDetailOptions, hydrate: boolean) {
  return start(container, <Detail vm={buildDetail(spec, record, options)} />, hydrate).rendered;
}

export function bindFormView(container: HTMLElement, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) {
  const messages = formMessages(language);
  const fields = (next: RecordData, view: RowView) => (
    <FormFields
      fields={bindForm(template, next, { language, collapsed: view.collapsed })}
      buttons={bindButtons(template, next, { language })}
      messages={messages}
      description={formDescription(template, { language })}
    />
  );
  const view = start(container, fields(data, { collapsed: new Set<string>() }), hydrate);
  return {
    rendered: view.rendered,
    load: (next: RecordData, state: RowView) => view.render(fields(next, state)),
    dispose: () => flushSync(() => view.root.unmount()),
  };
}

export function sessionFormView(container: HTMLElement, session: FormInstance, hydrate: boolean) {
  const view = start(container, <Form form={session} />, hydrate);
  return { rendered: view.rendered, dispose: () => flushSync(() => view.root.unmount()) };
}
