/**
 * Layout (docs/spec/form-markup.md, Layout): in an inline layout, a checkbox or switcher field with
 * a label writes the label in the header and the input alone in the body, in React's server
 * rendering with the bytes of the HTML renderer and in the browser component.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm as htmlForm } from '@crudui/generator-html';
import { Form } from '../components/Form';
import { renderForm } from '../server';

const form = (layout: string) => createForm(compileForm({
  type: 'group',
  properties: {
    look: {
      type: 'group',
      design: { layout },
      properties: { sync: { type: 'switcher', label: 'Sync', description: 'Keeps every window in step.' }, agree: { type: 'checkbox', label: 'Agree' } },
    },
  },
}), { look: { sync: true } }, { language: 'en' });

describe('inline layout output of React', () => {
  test('the server rendering writes the label in the header and the input alone in the body', () => {
    const inline = form('inline');
    expect(renderForm(inline)).toContain(
      '<div class="crudui-node crudui-node--field crudui-node--inline" data-field-path="look.sync"><div class="crudui-node__header">' +
      '<label class="crudui-node__label" for="crudui:look.sync">Sync</label><p class="crudui-node__description">Keeps every window in step.</p></div>' +
      '<div class="crudui-node__body"><input class="valid-target crudui-input crudui-input--switch" id="crudui:look.sync" type="checkbox" role="switch" name="look[sync]" checked="" value="1"/></div></div>');
    expect(renderForm(inline)).toBe(htmlForm(inline));
    expect(renderForm(form('stacked'))).toBe(htmlForm(form('stacked')));
  });

  test('the component labels each input from the label column', () => {
    const view = render(<Form form={form('inline')} />);
    try {
      for (const [path, label] of [['look.sync', 'Sync'], ['look.agree', 'Agree']] as const) {
        const node = view.container.querySelector(`[data-field-path="${path}"]`)!;
        const header = node.querySelector(':scope > .crudui-node__header > label.crudui-node__label')!;
        const body = node.querySelector(':scope > .crudui-node__body')!;
        expect(header.textContent).toBe(label);
        expect(header.getAttribute('for')).toBe(`crudui:${path}`);
        expect([...body.children].map(child => child.tagName)).toEqual(['INPUT']);
        expect((body.firstElementChild as HTMLInputElement).labels![0]).toBe(header);
      }
    } finally { view.unmount(); }
  });
});
