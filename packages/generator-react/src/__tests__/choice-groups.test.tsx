/**
 * Choice groups (docs/spec/form-markup.md, Choice groups): React writes the choices of each group
 * of a select field as the options of one `optgroup` element, in its server rendering with the
 * bytes of the HTML renderer and in the browser component.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { renderForm as htmlForm } from '@polyspec/crudui-generator-html';
import { Form } from '../components/Form';
import { renderForm } from '../server';

const form = (field: Record<string, unknown>, data: Record<string, unknown> = {}) =>
  createForm(compileForm({ type: 'group', properties: { region: field } }), data, { language: 'en' });
const europe = { label: 'Europe & more', choices: [{ value: 'eu-west', label: 'West' }, { value: 'eu-north', label: 'North' }] };
const asia = { label: 'Asia', choices: [{ value: 'ap-east', label: 'East' }] };
const mixed = { type: 'select', items: [{ value: 'auto', label: 'Automatic' }, europe, asia] };

describe('choice group output of React', () => {
  test('the server rendering writes the groups with the bytes of the HTML renderer', () => {
    const region = form(mixed, { region: 'eu-north' });
    expect(renderForm(region)).toContain(
      '><option value="auto">Automatic</option><optgroup label="Europe &amp; more"><option value="eu-west">West</option>' +
      '<option value="eu-north" selected="">North</option></optgroup><optgroup label="Asia"><option value="ap-east">East</option></optgroup></select>');
    expect(renderForm(region)).toBe(htmlForm(region));
    const only = form({ type: 'select', items: [europe, asia] });
    expect(renderForm(only)).toBe(htmlForm(only));
  });

  test('a select with a behavior attribute writes the groups raw with the bytes of the HTML renderer', () => {
    const region = form({ ...mixed, behavior: { onchange: 'go()' } });
    expect(renderForm(region)).toContain('<optgroup label="Asia"><option value="ap-east">East</option></optgroup></select>');
    expect(renderForm(region)).toBe(htmlForm(region));
  });

  test('the component selects the option of the value inside its group', () => {
    const view = render(<Form form={form(mixed, { region: 'eu-north' })} />);
    try {
      const select = view.container.querySelector('select')!;
      expect([...select.children].map((child) => [child.tagName, child.getAttribute('label')])).toEqual([
        ['OPTION', null], ['OPTGROUP', 'Europe & more'], ['OPTGROUP', 'Asia'],
      ]);
      expect([...select.querySelectorAll('optgroup')].map((group) => [...group.children].map((option) => (option as HTMLOptionElement).value)))
        .toEqual([['eu-west', 'eu-north'], ['ap-east']]);
      expect(select.value).toBe('eu-north');
    } finally { view.unmount(); }
  });
});
