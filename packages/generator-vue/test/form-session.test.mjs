// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../src/components/Form';
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
import { compareInitialization, compareServerTakeover } from '../../../tests/fixtures/form-session/initialization.mjs';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

/** Run one shared form session case and record vue evidence for the features it proves. */
function proves(fixture, name, features, run) {
  return provesConformance({ features, fixture: `tests/fixtures/form-session/${fixture}`, runtime: 'vue', case: name }, run);
}
const SESSION_FEATURES = ['connectForm', 'connectOutline', 'runAction', 'viewState', 'formHistory'];

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
    await proves('initialization.mjs', 'compareServerTakeover', ['connectForm'], () =>
      compareServerTakeover({ element: initial.element, session: initial.session, expect }));
    await proves('initialization.mjs', 'compareInitialization', ['connectForm'], () =>
      compareInitialization({ initial, deferred, expect, flush: nextTick }));
  }
  finally { apps.forEach(app => app.unmount()); }
});

it('runs the shared browser lifecycle over a cached Vue form', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp({ render: () => h(Form, { form: session }) });
  app.mount(element);
  try {
    await proves('scenario.mjs', 'exerciseSessionDom', SESSION_FEATURES, () =>
      exerciseSessionDom({ element, session, expect, flush: nextTick }));
  }
  finally { app.unmount(); element.remove(); }
});

import { controlSpec, exerciseControls } from '../../../tests/fixtures/form-session/controls.mjs';
it('connects labels and preserves multiple choice values through editing and submission', async () => {
  const form = createForm(compileForm(controlSpec), { enabled: 1, memo: 'Original', choices: ['a', 'c'] });
  const element = document.createElement('form');
  document.body.append(element);
  const app = createApp({ render: () => h(Form, { form }) });
  app.mount(element);
  try {
    await proves('controls.mjs', 'exerciseControls', ['connectForm'], () =>
      exerciseControls({ element, form, expect, flush: nextTick }));
  }
  finally { app.unmount(); element.remove(); }
});
