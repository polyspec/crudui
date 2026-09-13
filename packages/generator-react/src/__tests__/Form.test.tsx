import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../components/Form';
// @ts-expect-error Shared browser lifecycle across all frameworks.
import { spec, data, exerciseSessionDom } from '../../../../tests/fixtures/form-session/scenario.mjs';
// @ts-expect-error Shared initialization comparison across all frameworks.
import { compareInitialization, compareServerTakeover } from '../../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createForm(template, data), element: document.createElement('form') };
  const deferred = { session: createForm(template), element: document.createElement('form') };
  const first = render(<Form form={initial.session} />, { container: initial.element });
  const second = render(<Form form={deferred.session} />, { container: deferred.element });
  try {
    compareServerTakeover({ element: initial.element, session: initial.session, expect });
    await act(async () => {
      await compareInitialization({ initial, deferred, expect, flush: async () => { await act(async () => {}); } });
    });
  } finally { first.unmount(); second.unmount(); }
});

it('injects into a mounted cached form, edits, copies, sorts, rekeys, deletes and adds', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const { container } = render(<Form form={session} />);
  await act(async () => {
    await exerciseSessionDom({ element: container, session, expect, flush: async () => { await act(async () => {}); } });
  });
});

// @ts-expect-error Shared browser control assertions across frameworks.
import { controlSpec, exerciseControls } from '../../../../tests/fixtures/form-session/controls.mjs';
it('connects labels and preserves multiple choice values through editing and submission', async () => {
  const form = createForm(compileForm(controlSpec), { enabled: 1, memo: 'Original', choices: ['a', 'c'] });
  const element = document.createElement('form');
  document.body.append(element);
  const view = render(<Form form={form} />, { container: element });
  try {
    await act(async () => {
      await exerciseControls({ element, form, expect, flush: async () => { await act(async () => {}); } });
    });
  } finally { view.unmount(); element.remove(); }
});
