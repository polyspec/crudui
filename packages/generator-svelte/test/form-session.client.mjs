import { mount, unmount, tick } from 'svelte';
import { expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import Form from '../src/components/Form.svelte';
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
import { compareInitialization } from '../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createForm(template, data), element: document.createElement('form') };
  const deferred = { session: createForm(template), element: document.createElement('form') };
  const apps = [initial, deferred].map(({ session, element }) => mount(Form, { target: element, props: { form: session } }));
  await tick();
  try { await compareInitialization({ initial, deferred, expect, flush: tick }); }
  finally { await Promise.all(apps.map(app => unmount(app))); }
});

it('runs the shared browser lifecycle over a cached Svelte form', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  document.body.append(element);
  const app = mount(Form, { target: element, props: { form: session } });
  await tick();
  try { await exerciseSessionDom({ element, session, expect, flush: tick }); }
  finally { await unmount(app); element.remove(); }
});

it('preserves consecutive native input across Svelte renders', async () => {
  const form = createForm(compileForm({
    type: 'group',
    properties: { name: { type: 'text' } },
  }));
  const element = document.createElement('form');
  document.body.append(element);
  const app = mount(Form, { target: element, props: { form } });
  await tick();
  try {
    const input = () => element.querySelector('input[name="name"]');
    input().focus();
    const active = input();
    let expected = '';
    for (const character of 'continuous') {
      expected += character;
      active.value = expected;
      active.setSelectionRange(expected.length, expected.length);
      active.dispatchEvent(new InputEvent('input', { bubbles: true, data: character, inputType: 'insertText' }));
      expect(form.getValue('name')).toBe(expected);
      await tick();
      expect(input().value).toBe(expected);
      expect(document.activeElement).toBe(input());
      expect(input().selectionStart).toBe(expected.length);
      expect(form.getSnapshot().revision).toBe(expected.length);
    }
    expect(new FormData(element).get('name')).toBe(expected);
  } finally { await unmount(app); element.remove(); }
});

import { controlSpec, exerciseControls } from '../../../tests/fixtures/form-session/controls.mjs';
it('connects labels and preserves multiple choice values through editing and submission', async () => {
  const form = createForm(compileForm(controlSpec), { enabled: 1, memo: 'Original', choices: ['a', 'c'] });
  const element = document.createElement('form');
  document.body.append(element);
  const app = mount(Form, { target: element, props: { form } });
  await tick();
  try { await exerciseControls({ element, form, expect, flush: tick }); }
  finally { await unmount(app); element.remove(); }
});
