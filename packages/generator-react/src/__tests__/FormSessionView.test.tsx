import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { compileForm, createFormSession } from '@polyspec/generator-core';
import { FormSessionView } from '../v2/components/FormSessionView';
import { FormBuilder } from '../components/FormBuilder';
// @ts-expect-error Shared browser lifecycle across all frameworks.
import { spec, exerciseSessionDom } from '../../../../tests/fixtures/form-session/scenario.mjs';

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
