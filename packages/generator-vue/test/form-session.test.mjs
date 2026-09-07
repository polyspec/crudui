// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@crudui/generator-core';
import { FormSessionView } from '../src/components/FormSessionView';
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
import { compareInitialization } from '../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createFormSession(template, data), element: document.createElement('form') };
  const deferred = { session: createFormSession(template), element: document.createElement('form') };
  const apps = [initial, deferred].map(({ session, element }) => {
    const app = createApp({ render: () => h(FormSessionView, { session }) });
    app.mount(element);
    return app;
  });
  try { await compareInitialization({ initial, deferred, expect, flush: nextTick }); }
  finally { apps.forEach(app => app.unmount()); }
});

it('runs the shared browser lifecycle over a cached Vue form', async () => {
  const session = createFormSession(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp({ render: () => h(FormSessionView, { session }) });
  app.mount(element);
  try { await exerciseSessionDom({ element, session, expect, flush: nextTick }); }
  finally { app.unmount(); element.remove(); }
});
