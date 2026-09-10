import { flushSync, mount, unmount } from 'svelte';
import { bindForm } from '@crudui/generator-core';
import BindFormView from './BindFormView.svelte';

export function mountView(element, template, language, data = {}) {
  const fields = bindForm(template, data, { language });
  const app = flushSync(() => mount(BindFormView, { target: element, props: { initialFields: fields } }));
  return {
    load: next => flushSync(() => app.load(bindForm(template, next, { language }))),
    dispose: () => unmount(app),
  };
}
