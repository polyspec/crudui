import { mount, unmount, tick } from 'svelte';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@crudui/generator-core';
import FormSessionView from '../src/components/FormSessionView.svelte';
import { spec, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';

it('runs the shared browser lifecycle over a cached Svelte form', async () => {
  const session = createFormSession(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = mount(FormSessionView, { target: element, props: { session } });
  await tick();
  try { await exerciseSessionDom({ element, session, expect, flush: tick }); }
  finally { await unmount(app); element.remove(); }
});
