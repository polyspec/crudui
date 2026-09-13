import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../components/Form';

const behavior = { onchange: 'document.body.dataset.cruduiBehaviorEvents = String(Number(document.body.dataset.cruduiBehaviorEvents || 0) + 1)' };
const template = compileForm({ type: 'group', properties: {
  dates: { type: 'datetime', multiple: { copy: true, sortable: true }, behavior },
  notes: { type: 'tinymce', multiple: true, behavior },
  translated: { type: 'datetime', lang: { only: ['en', 'ko'] }, behavior },
} });
const data = { dates: { first: '2026-09-09T12:00' }, notes: { first: 'One' }, translated: { en: '2026-09-09T12:00', ko: '2026-09-09T13:00' } };
afterEach(() => { delete document.body.dataset.cruduiBehaviorEvents; });

it('preserves declared handlers in repeated and language SSR controls', () => {
  const html = renderToStaticMarkup(<Form form={createForm(template, data)} />);
  expect(html.match(/ onchange=/g)).toHaveLength(4);
  expect(html).toContain('data-rule-name="dates[]"');
  expect(html).toContain('data-rule-name="notes[]"');
});

it('executes handlers, updates values and retains the existing row and language containers', () => {
  const form = createForm(template, data);
  const view = render(<Form form={form} />);
  try {
    expect(view.container.querySelectorAll('[onchange]')).toHaveLength(4);
    const date = view.container.querySelector<HTMLInputElement>('input[name="dates[first]"]')!;
    expect(date.getAttribute('onchange')).toBe(behavior.onchange);
    expect(typeof date.onchange).toBe('function');
    // The row body holds only the widget; row controls live in the row header.
    expect(Array.from(date.parentElement!.children, child => child.tagName)).toEqual(['INPUT']);
    expect(date.closest('[data-crudui-row-key]')!.querySelectorAll('[data-crudui-action]')).toHaveLength(5);
    for (const language of view.container.querySelectorAll('[data-lang]')) {
      expect(Array.from(language.querySelector('input')!.parentElement!.children, child => child.tagName)).toEqual(['INPUT']);
    }
    fireEvent.change(date, { target: { value: '2026-09-10T14:00' } });
    expect(document.body.dataset.cruduiBehaviorEvents).toBe('1');
    expect(form.getValue('dates.first')).toBe('2026-09-10T14:00');
    const note = view.container.querySelector<HTMLTextAreaElement>('textarea[name="notes[first]"]')!;
    fireEvent.change(note, { target: { value: 'Updated' } });
    expect(document.body.dataset.cruduiBehaviorEvents).toBe('2');
    expect(form.getValue('notes.first')).toBe('Updated');
    const translated = view.container.querySelector<HTMLInputElement>('input[name="translated[en]"]')!;
    fireEvent.change(translated, { target: { value: '2026-09-10T15:00' } });
    expect(document.body.dataset.cruduiBehaviorEvents).toBe('3');
    expect(form.getValue('translated.en')).toBe('2026-09-10T15:00');
    act(() => form.setData(data));
    expect(view.container.querySelectorAll('[onchange]')).toHaveLength(4);
    fireEvent.click(view.container.querySelector('[data-field-path="dates"] [data-crudui-action="add-row"]')!);
    expect(Object.keys(form.getData().dates as object)).toHaveLength(2);
    expect(view.container.querySelectorAll('[onchange]')).toHaveLength(5);
  } finally { view.unmount(); }
});

it('preserves exact injected HTML and focus when adding a row beside a raw editor', () => {
  const initial = createForm(template, data);
  const deferred = createForm(template, {});
  const first = render(<Form form={initial} />);
  const second = render(<Form form={deferred} />);
  try {
    const original = first.container.innerHTML;
    act(() => deferred.setData(data));
    expect(second.container.innerHTML).toBe(original);
    const note = second.container.querySelector<HTMLTextAreaElement>('textarea[name="notes[first]"]')!;
    note.focus();
    note.setSelectionRange(1, 2);
    const button = note.closest('[data-crudui-row-key]')!.querySelector('[data-crudui-action="add-row"]')!;
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    const focused = document.activeElement as HTMLTextAreaElement;
    expect(focused.name).toBe('notes[first]');
    expect(focused.selectionStart).toBe(1);
    expect(focused.selectionEnd).toBe(2);
    act(() => deferred.setData({ ...data, notes: {} }));
    act(() => deferred.setData(data));
    expect(second.container.innerHTML).toBe(original);
    act(() => deferred.setData(data));
    expect(second.container.innerHTML).toBe(original);
  } finally {
    first.unmount();
    second.unmount();
  }
});
