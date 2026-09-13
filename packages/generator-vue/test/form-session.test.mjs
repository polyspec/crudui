// @vitest-environment jsdom
import '../../../tests/fixtures/form-session/jsdom.mjs';
import { createApp, h, nextTick } from 'vue';
import { expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../src/components/Form';
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
import { compareInitialization, compareServerTakeover } from '../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createForm(template, data), element: document.createElement('form') };
  const deferred = { session: createForm(template), element: document.createElement('form') };
  const apps = [initial, deferred].map(({ session, element }) => {
    const app = createApp({ render: () => h(Form, { form: session }) });
    app.mount(element);
    return app;
  });
  try {
    compareServerTakeover({ element: initial.element, session: initial.session, expect });
    await compareInitialization({ initial, deferred, expect, flush: nextTick });
  }
  finally { apps.forEach(app => app.unmount()); }
});

it('runs the shared browser lifecycle over a cached Vue form', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp({ render: () => h(Form, { form: session }) });
  app.mount(element);
  try { await exerciseSessionDom({ element, session, expect, flush: nextTick }); }
  finally { app.unmount(); element.remove(); }
});

import { controlSpec, exerciseControls } from '../../../tests/fixtures/form-session/controls.mjs';
it('connects labels and preserves multiple choice values through editing and submission', async () => {
  const form = createForm(compileForm(controlSpec), { enabled: 1, memo: 'Original', choices: ['a', 'c'] });
  const element = document.createElement('form');
  document.body.append(element);
  const app = createApp({ render: () => h(Form, { form }) });
  app.mount(element);
  try { await exerciseControls({ element, form, expect, flush: nextTick }); }
  finally { app.unmount(); element.remove(); }
});
