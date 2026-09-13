import { flushSync, mount, unmount } from 'svelte';
import { bindButtons, bindForm, formMessages } from '@crudui/generator-core';
import BindFormView from './BindFormView.svelte';

const emptyView = { collapsed: new Set(), canUndo: false };

export function mountView(element, template, language, data = {}) {
  const messages = formMessages(language);
  const evaluate = (next, view = emptyView) => ({
    fields: bindForm(template, next, { language, collapsed: view.collapsed }),
    buttons: bindButtons(template, next, { language }),
    data: next, selection: view.selection, canUndo: view.canUndo,
  });
  const app = flushSync(() => mount(BindFormView, {
    target: element, props: { initial: evaluate(data), messages },
  }));
  return {
    load: (next, view) => flushSync(() => app.load(evaluate(next, view))),
    dispose: () => unmount(app),
  };
}
