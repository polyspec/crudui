import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@crudui/generator-core';
import { FormSessionView } from '../components/FormSessionView';
import { FormBuilder } from '../legacy/components/FormBuilder';
// @ts-expect-error Shared browser lifecycle across all frameworks.
import { spec, data, exerciseSessionDom } from '../../../../tests/fixtures/form-session/scenario.mjs';
// @ts-expect-error Shared initialization comparison across all frameworks.
import { compareInitialization } from '../../../../tests/fixtures/form-session/initialization.mjs';

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createFormSession(template, data), element: document.createElement('form') };
  const deferred = { session: createFormSession(template), element: document.createElement('form') };
  const first = render(<FormSessionView session={initial.session} />, { container: initial.element });
  const second = render(<FormSessionView session={deferred.session} />, { container: deferred.element });
  try {
    await act(async () => {
      await compareInitialization({ initial, deferred, expect, flush: async () => { await act(async () => {}); } });
    });
  } finally { first.unmount(); second.unmount(); }
});

it('injects into a mounted cached form, edits, copies, sorts, rekeys, deletes and adds', async () => {
  const session = createFormSession(compileForm(spec, { keyPrefix: 'form' }), {});
  const { container } = render(<FormSessionView session={session} />);
  await act(async () => {
    await exerciseSessionDom({ element: container, session, expect, flush: async () => { await act(async () => {}); } });
  });
});

it('also allows late data injection into the legacy React FormBuilder', () => {
  const spec = { type: 'group' as const, properties: { name: { type: 'text' as const } } };
  const { container, rerender } = render(<FormBuilder spec={spec} />);
  rerender(<FormBuilder spec={spec} data={{ name: 'late data' }} />);
  expect(container.querySelector('input')?.value).toBe('late data');
});
