import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../components/Form';
// @ts-expect-error Shared browser lifecycle across all frameworks.
import { spec, data, exerciseSessionDom } from '../../../../tests/fixtures/form-session/scenario.mjs';
// @ts-expect-error Shared initialization comparison across all frameworks.
import { compareInitialization, compareServerTakeover } from '../../../../tests/fixtures/form-session/initialization.mjs';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

/** Run one shared form session case and record react evidence for the features it proves. */
function proves(fixture: string, name: string, features: string[], run: () => unknown) {
  return provesConformance({ features, fixture: `tests/fixtures/form-session/${fixture}`, runtime: 'react', case: name }, run);
}
const SESSION_FEATURES = ['connectForm', 'connectOutline', 'runAction', 'viewState', 'formHistory'];

it('renders identical HTML and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createForm(template, data), element: document.createElement('form') };
  const deferred = { session: createForm(template), element: document.createElement('form') };
  const first = render(<Form form={initial.session} />, { container: initial.element });
  const second = render(<Form form={deferred.session} />, { container: deferred.element });
  try {
    await proves('initialization.mjs', 'compareServerTakeover', ['connectForm'], () =>
      compareServerTakeover({ element: initial.element, session: initial.session, expect }));
    await act(async () => {
      await proves('initialization.mjs', 'compareInitialization', ['connectForm'], () =>
        compareInitialization({ initial, deferred, expect, flush: async () => { await act(async () => {}); } }));
    });
  } finally { first.unmount(); second.unmount(); }
});

it('injects into a mounted cached form, edits, copies, sorts, rekeys, deletes and adds', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const { container } = render(<Form form={session} />);
  await act(async () => {
    await proves('scenario.mjs', 'exerciseSessionDom', SESSION_FEATURES, () =>
      exerciseSessionDom({ element: container, session, expect, flush: async () => { await act(async () => {}); } }));
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
      await proves('controls.mjs', 'exerciseControls', ['connectForm'], () =>
        exerciseControls({ element, form, expect, flush: async () => { await act(async () => {}); } }));
    });
  } finally { view.unmount(); element.remove(); }
});
