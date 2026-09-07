// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@crudui/generator-core';
import { FormSessionView } from '../src/components/FormSessionView';
import { spec, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';

it('runs the shared browser lifecycle over a cached Vue form', async () => {
  const session = createFormSession(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp({ render: () => h(FormSessionView, { session }) });
  app.mount(element);
  try { await exerciseSessionDom({ element, session, expect, flush: nextTick }); }
  finally { app.unmount(); element.remove(); }
});
