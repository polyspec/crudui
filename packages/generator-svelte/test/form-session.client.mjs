import { mount, unmount, tick } from 'svelte';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@crudui/generator-core';
import FormSessionView from '../src/components/FormSessionView.svelte';
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
import { compareInitialization } from '../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createFormSession(template, data), element: document.createElement('form') };
  const deferred = { session: createFormSession(template), element: document.createElement('form') };
  const apps = [initial, deferred].map(({ session, element }) => mount(FormSessionView, { target: element, props: { session } }));
  await tick();
  try { await compareInitialization({ initial, deferred, expect, flush: tick }); }
  finally { await Promise.all(apps.map(app => unmount(app))); }
});

it('runs the shared browser lifecycle over a cached Svelte form', async () => {
  const session = createFormSession(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = mount(FormSessionView, { target: element, props: { session } });
  await tick();
  try { await exerciseSessionDom({ element, session, expect, flush: tick }); }
  finally { await unmount(app); element.remove(); }
});
