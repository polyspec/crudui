// The canonical page with the React components. Hydration adopts the server-rendered nodes; a
// mismatch is a recoverable React error, which fails the view.
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { bindButtons, bindForm, buildDetail, buildList, formMessages } from '@crudui/generator-core';
import { Detail } from '#react/Detail';
import { Form } from '#react/Form';
import { FormFields } from '#react/FormFields';
import { List } from '#react/List';

/** Publish the commit of the hydrated or mounted tree. */
function Committed({ onCommit, children }) {
  React.useEffect(onCommit, [onCommit]);
  return children;
}

/** Render `element(commit)` into the container and resolve after React committed it. */
function start(container, element, hydrate) {
  let commit;
  let fail;
  const rendered = new Promise((resolve, reject) => { commit = () => resolve(); fail = reject; });
  const tree = content => <Committed onCommit={commit}>{content}</Committed>;
  let root;
  if (hydrate) {
    root = hydrateRoot(container, tree(element), { onRecoverableError: error => fail(error) });
  } else {
    root = createRoot(container);
    flushSync(() => root.render(tree(element)));
  }
  return { rendered, render: content => flushSync(() => root.render(tree(content))), root };
}

export function list(container, spec, rows, options, hydrate) {
  const vm = buildList(spec, rows, options);
  return start(container, <List vm={vm} layout={options.layout} />, hydrate).rendered;
}

export function detail(container, spec, record, options, hydrate) {
  return start(container, <Detail vm={buildDetail(spec, record, options)} />, hydrate).rendered;
}

export function bindFormView(container, template, language, data, hydrate) {
  const messages = formMessages(language);
  const fields = (next, view) => (
    <FormFields
      fields={bindForm(template, next, { language, collapsed: view.collapsed })}
      buttons={bindButtons(template, next, { language })}
      messages={messages}
    />
  );
  const view = start(container, fields(data, { collapsed: new Set() }), hydrate);
  return {
    rendered: view.rendered,
    load: (next, state) => view.render(fields(next, state)),
    dispose: () => flushSync(() => view.root.unmount()),
  };
}

export function sessionFormView(container, session, hydrate) {
  const view = start(container, <Form form={session} />, hydrate);
  return { rendered: view.rendered, dispose: () => flushSync(() => view.root.unmount()) };
}
