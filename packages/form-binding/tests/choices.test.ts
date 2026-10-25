// The choices of a group source in the browser validation binding (README, "Choices from a
// repeated group"; docs/spec/schema.md, CUSC-071): the binding renders the widget of each field
// with a group source again from the data of the controls, as the renderer writes it, and keeps
// the values its controls hold.
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { renderForm } from '@polyspec/crudui-generator-html';
import { describe, expect, it } from 'vitest';

import { bindForm } from '../src/index';
import { control, documentOf, found, named, node, renderedForm, type } from './dom';

const spec = {
  type: 'group',
  properties: {
    characters: {
      type: 'group',
      label: 'Characters',
      multiple: true,
      properties: { id: { type: 'text', label: 'Id' }, name: { type: 'text', label: 'Name' } },
    },
    lead: { type: 'select', label: 'Lead', items: { from: 'characters.*.id', label: 'name' }, validate: { required: true } },
    cast: { type: 'multichoice', label: 'Cast', items: { from: 'characters.*.id', label: 'name' } },
    roles: {
      type: 'group',
      label: 'Roles',
      multiple: true,
      properties: { character: { type: 'radio', label: 'Character', items: { from: 'characters.*.id' } } },
    },
  },
};
const data = {
  characters: { __ann__: { id: 'ann', name: 'Ann' }, __bob__: { id: 'bob', name: 'Bob' } },
  lead: 'bob',
  cast: ['ann'],
  roles: { __r1__: { character: 'bob' } },
};

function setup() {
  const page = renderedForm(spec, data);
  const binding = bindForm(page.form, spec, { keyPrefix: 'form' });
  return { ...page, binding };
}

/** The value, text and selection of each option of the lead select. */
function leadOptions(form: HTMLFormElement): Array<[string, string, boolean]> {
  return Array.from(named(form, 'select', 'form[lead]').options, option => [option.value, option.textContent ?? '', option.selected]);
}

/** The value, label text and checked state of each input of a choice field. */
function choices(form: HTMLFormElement, name: string): Array<[string, string, boolean]> {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input'))
    .filter(input => input.name === name)
    .map(input => [input.value, found(form.querySelector(`label[for="${input.id}"]`), `the label of ${input.id}`).textContent ?? '', input.checked]);
}

/** The body markup of the node at `path` of a form. */
function bodyOf(form: HTMLFormElement, path: string): string {
  return found(node(form, path).querySelector('.crudui-node__body'), `the body of ${path}`).innerHTML;
}

/** The body markup of the node at `path` in the form that the renderer writes for `record`. */
function renderedBody(record: Record<string, unknown>, path: string, options: { idPrefix?: string } = {}): string {
  const html = renderForm(createForm(compileForm(spec, { keyPrefix: 'form' }), record, { language: 'en', ...options }),
    { action: { method: 'post', url: '/submit' } });
  return bodyOf(found(documentOf(html).document.querySelector('form'), 'the rendered form'), path);
}

describe('choices from a repeated group', () => {
  it('relabels the choices of every field with the source when a label is typed, and keeps the selection', () => {
    const { window, form } = setup();
    type(window, control(form, 'form[characters][__ann__][name]'), 'Anna');
    expect(leadOptions(form)).toStrictEqual([['ann', 'Anna', false], ['bob', 'Bob', true]]);
    expect(choices(form, 'form[cast][]')).toStrictEqual([['ann', 'Anna', true], ['bob', 'Bob', false]]);
    expect(choices(form, 'form[roles][__r1__][character]')).toStrictEqual([['ann', 'ann', false], ['bob', 'bob', true]]);
  });

  it('writes the markup that the renderer writes for the data of the controls', () => {
    const { window, form } = setup();
    type(window, control(form, 'form[characters][__ann__][id]'), 'cy');
    const edited = { ...data, characters: { __ann__: { id: 'cy', name: 'Ann' }, __bob__: { id: 'bob', name: 'Bob' } } };
    expect(bodyOf(form, 'lead')).toBe(renderedBody(edited, 'lead'));
    expect(bodyOf(form, 'cast')).toBe(renderedBody({ ...edited, cast: [] }, 'cast'));
    expect(bodyOf(form, 'roles.__r1__.character')).toBe(renderedBody(edited, 'roles.__r1__.character'));
  });

  it('holds no value whose choice is gone, and selects no lead option', () => {
    const { window, form, binding } = setup();
    type(window, control(form, 'form[characters][__bob__][id]'), 'rob');
    expect(leadOptions(form)).toStrictEqual([['ann', 'Ann', false], ['rob', 'Bob', false]]);
    expect(named(form, 'select', 'form[lead]').selectedIndex).toBe(-1);
    expect(choices(form, 'form[roles][__r1__][character]')).toStrictEqual([['ann', 'ann', false], ['rob', 'rob', false]]);
    // The value is no longer held, so the required lead fails as a submission without it would.
    expect(binding.validate().errors.map(error => [error.path, error.rule])).toStrictEqual([['lead', 'required']]);
    type(window, control(form, 'form[characters][__bob__][id]'), 'bob');
    expect(leadOptions(form)).toStrictEqual([['ann', 'Ann', false], ['bob', 'Bob', false]]);
  });

  it('keeps the aria-invalid of the controls of a refreshed node', () => {
    const { window, form, binding } = setup();
    named(form, 'select', 'form[lead]').selectedIndex = -1;
    expect(binding.validate().valid).toBe(false);
    expect(named(form, 'select', 'form[lead]').getAttribute('aria-invalid')).toBe('true');
    type(window, control(form, 'form[characters][__ann__][name]'), 'Anna');
    expect(named(form, 'select', 'form[lead]').getAttribute('aria-invalid')).toBe('true');
  });

  it('renders the controls with the idPrefix the server rendered them with', () => {
    const html = renderForm(createForm(compileForm(spec, { keyPrefix: 'form' }), data, { language: 'en', idPrefix: 'cast' }),
      { action: { method: 'post', url: '/submit' } });
    const { window, document } = documentOf(html);
    const form = found(document.querySelector('form'), 'the form element');
    bindForm(form, spec, { keyPrefix: 'form', language: 'en', idPrefix: 'cast' });
    type(window, control(form, 'form[characters][__ann__][name]'), 'Anna');
    const edited = { ...data, characters: { __ann__: { id: 'ann', name: 'Anna' }, __bob__: { id: 'bob', name: 'Bob' } } };
    expect(bodyOf(form, 'cast')).toBe(renderedBody(edited, 'cast', { idPrefix: 'cast' }));
  });
});
