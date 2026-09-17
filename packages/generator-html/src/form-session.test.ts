// @vitest-environment jsdom
/**
 * Shared form session scenarios over the HTML renderer's DOM binding.
 *
 * An application that uses the HTML renderer renders the session with `renderForm` and
 * `renderOutline`, connects the markup with `connectForm` and `connectOutline` from
 * @crudui/generator-core, and on every change patches the new markup into the page with
 * `patchContent` and synchronizes the controls (tests/form-styles.test.mjs mounts it the same
 * way in a browser). The React, Vue and Svelte
 * form tests run the same scenario modules over their components.
 */

import { expect, test } from 'vitest';
import {
  compileForm, connectForm, connectOutline, createForm, patchContent,
  type FormInstance,
} from '@crudui/generator-core';
import { renderForm, renderOutline } from './index';
// @ts-expect-error Shared browser lifecycle across all renderers.
import { spec, data, exerciseSessionDom } from '../../../tests/fixtures/form-session/scenario.mjs';
// @ts-expect-error Shared initialization comparison across all renderers.
import { compareInitialization, compareServerTakeover } from '../../../tests/fixtures/form-session/initialization.mjs';
// @ts-expect-error Shared control assertions across all renderers.
import { controlSpec, exerciseControls } from '../../../tests/fixtures/form-session/controls.mjs';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

const SESSION_FEATURES = ['connectForm', 'connectOutline', 'runAction', 'viewState', 'formHistory'];

/** Run one shared form session case and record javascript-dom evidence for the features it proves. */
function proves(fixture: string, name: string, features: string[], run: () => unknown) {
  return provesConformance(
    { features, fixture: `tests/fixtures/form-session/${fixture}`, runtime: 'javascript-dom', case: name },
    run
  );
}

/** Rendering is synchronous: a change has been rendered and synchronized when it returns. */
const flush = async () => {};

/**
 * Mount a session as an HTML renderer application does: render the form and its structure
 * map, connect both, and render and synchronize again on every change.
 */
function mount(session: FormInstance, element: HTMLElement) {
  const outline = document.createElement('div');
  document.body.append(element, outline);
  element.innerHTML = renderForm(session);
  outline.innerHTML = renderOutline(session);
  const connection = connectForm(element, session);
  const outlineConnection = connectOutline(outline, session, element);
  const unsubscribe = session.subscribe(() => {
    patchContent(element, renderForm(session));
    connection.sync();
    patchContent(outline, renderOutline(session));
  });
  return () => {
    unsubscribe();
    outlineConnection.disconnect();
    connection.disconnect();
    element.remove();
    outline.remove();
  };
}

test('renders identical DOM and control state with initial or repeatedly injected data', async () => {
  const template = compileForm(spec, { keyPrefix: 'form' });
  const initial = { session: createForm(template, data), element: document.createElement('form') };
  const deferred = { session: createForm(template), element: document.createElement('form') };
  const unmounts = [initial, deferred].map(({ session, element }) => mount(session, element));
  try {
    await proves('initialization.mjs', 'compareServerTakeover', ['connectForm', 'patchContent'], () =>
      compareServerTakeover({ element: initial.element, session: initial.session, expect }));
    await proves('initialization.mjs', 'compareInitialization', ['connectForm', 'patchContent'], () =>
      compareInitialization({ initial, deferred, expect, flush }));
  } finally {
    unmounts.forEach(unmount => unmount());
  }
});

test('runs the shared browser lifecycle over the connected HTML form', async () => {
  const session = createForm(compileForm(spec, { keyPrefix: 'form' }), {});
  const element = document.createElement('div');
  const unmount = mount(session, element);
  try {
    await proves('scenario.mjs', 'exerciseSessionDom', SESSION_FEATURES, () =>
      exerciseSessionDom({ element, session, expect, flush }));
  } finally {
    unmount();
  }
});

test('connects labels and preserves multiple choice values through editing and submission', async () => {
  const form = createForm(compileForm(controlSpec), { enabled: 1, memo: 'Original', choices: ['a', 'c'] });
  const element = document.createElement('form');
  const unmount = mount(form, element);
  try {
    await proves('controls.mjs', 'exerciseControls', ['connectForm'], () =>
      exerciseControls({ element, form, expect, flush }));
  } finally {
    unmount();
  }
});
