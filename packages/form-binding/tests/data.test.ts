// The data the binding builds from the controls of a rendered form equals what a native
// submission sends and a server decodes from the bracketed names (form-runtime.md, "Data").
import { describe, expect, it } from 'vitest';

import { collectData } from '../src/data';
import { control, documentOf, renderedForm } from './dom';

const first = '__0000000000001__';
const spec = {
  type: 'group',
  properties: {
    name: { type: 'text' },
    email: { type: 'email' },
    secret: { type: 'password' },
    age: { type: 'number' },
    note: { type: 'textarea' },
    token: { type: 'hidden' },
    born: { type: 'date' },
    at: { type: 'datetime' },
    size: { type: 'select', items: ['small', 'medium'] },
    agree: { type: 'checkbox' },
    tags: { type: 'multichoice', items: ['a', 'b', 'c'] },
    color: { type: 'choice', items: ['red', 'green'] },
    photo: { type: 'file' },
    title: { type: 'text', lang: { only: ['ko', 'en'] } },
    stores: { type: 'group', multiple: true, properties: { name: { type: 'text' } } },
    codes: { type: 'text', multiple: true },
    later: { type: 'text', design: { show: false } },
  },
};
const filled = {
  name: 'Ada', email: 'ada@example.com', age: '42', note: 'one\ntwo', token: 't-1', born: '2026-01-02',
  at: '2026-01-02T03:04:05', size: '1', agree: '1', tags: ['0', '2'], color: '1', title: { ko: '가', en: 'A' },
  stores: { [first]: { name: 'Seoul' } }, codes: { [first]: 'C1' }, later: 'kept',
};

const body = (form: HTMLFormElement) => form.querySelector<HTMLElement>('.crudui-form__body')!;

describe('data collection', () => {
  it('reads every supported control kind as the string a submission sends', () => {
    const { form } = renderedForm(spec, filled);
    expect(collectData(body(form), 'form')).toStrictEqual({
      name: 'Ada', email: 'ada@example.com', secret: '', age: '42', note: 'one\r\ntwo', token: 't-1',
      born: '2026-01-02', at: '2026-01-02T03:04:05', size: '1', agree: '1', tags: ['0', '2'], color: '1',
      title: { ko: '가', en: 'A' }, stores: { [first]: { name: 'Seoul' } }, codes: { [first]: 'C1' }, later: 'kept',
    });
  });

  it('leaves out unchecked choices and collections without rows, and keeps empty text', () => {
    const { form } = renderedForm(spec, { stores: {}, codes: {} });
    expect(collectData(body(form), 'form')).toStrictEqual({
      name: '', email: '', secret: '', age: '', note: '', token: '', born: '', at: '', size: '0',
      title: { ko: '', en: '' }, later: '',
    });
  });

  it('reads the values a visitor entered, not the rendered defaults', () => {
    const { form } = renderedForm(spec, { stores: {}, codes: {} });
    control(form, 'form[name]').value = 'Typed';
    control(form, 'form[agree]').checked = true;
    control(form, 'form[tags][]', '1').checked = true;
    control(form, 'form[color]', '0').checked = true;
    control<HTMLSelectElement>(form, 'form[size]').value = '1';
    control<HTMLTextAreaElement>(form, 'form[note]').value = 'a\rb\nc\r\nd';
    expect(collectData(body(form), 'form')).toMatchObject({
      name: 'Typed', agree: '1', tags: ['1'], color: '0', size: '1', note: 'a\r\nb\r\nc\r\nd',
    });
  });

  it('reads each selected option of a multiple select into a list and leaves out an empty one', () => {
    const { form } = renderedForm({ type: 'group', properties: { sizes: { type: 'select', items: ['s', 'm', 'l'] } } }, {});
    const select = control<HTMLSelectElement>(form, 'form[sizes]');
    select.multiple = true;
    select.name = 'form[sizes][]';
    for (const option of Array.from(select.options)) option.selected = option.value !== '1';
    expect(collectData(body(form), 'form')).toStrictEqual({ sizes: ['0', '2'] });
    for (const option of Array.from(select.options)) option.selected = false;
    expect(collectData(body(form), 'form')).toStrictEqual({});
  });

  it('reads switch, range, grouped select, button and laid-out group fields as a submission sends them', () => {
    const laidOut = {
      type: 'group',
      properties: {
        on: { type: 'switcher', label: 'On' },
        level: { type: 'range', validate: { range: [0, 100], step: 5 } },
        pick: { type: 'select', items: [{ value: 'a', label: 'A' }, { label: 'G', choices: [{ value: 'b', label: 'B' }] }] },
        go: { type: 'button', content: 'Go' },
        row: { type: 'group', design: { layout: 'line' }, properties: { x: { type: 'text' } } },
        inline: { type: 'group', design: { layout: 'inline' }, properties: { z: { type: 'text' } } },
      },
    };
    const { form } = renderedForm(laidOut, { row: { x: 'X' }, inline: { z: 'Z' } });
    // An empty range control holds the midpoint of its bounds, and a submission sends it.
    expect(collectData(body(form), 'form')).toStrictEqual({ level: '50', pick: 'a', row: { x: 'X' }, inline: { z: 'Z' } });
    control(form, 'form[on]').checked = true;
    control(form, 'form[level]').value = '35';
    control<HTMLSelectElement>(form, 'form[pick]').value = 'b';
    expect(collectData(body(form), 'form')).toStrictEqual({ on: '1', level: '35', pick: 'b', row: { x: 'X' }, inline: { z: 'Z' } });
  });

  it('leaves out file, disabled and node-less controls', () => {
    const { document, form } = renderedForm(spec, filled, { hidden: { _csrf: 'secret' } });
    control(form, 'form[name]').disabled = true;
    const fieldset = document.createElement('fieldset');
    fieldset.disabled = true;
    const email = control(form, 'form[email]');
    email.replaceWith(fieldset);
    fieldset.append(email);
    const outside = document.createElement('input');
    outside.name = 'form[outside]';
    body(form).prepend(outside);
    const data = collectData(body(form), 'form');
    expect(data).not.toHaveProperty('name');
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('photo');
    expect(data).not.toHaveProperty('outside');
    expect(data).not.toHaveProperty('_csrf');
  });

  it('reads names without a key prefix when the form has none', () => {
    const { document } = documentOf(
      '<div class="crudui-form__body"><div data-field-path="name"><input name="name" value="Ada"/></div>' +
      `<div data-field-path="rows"><div data-crudui-row-key="${first}"><input name="rows[${first}]" value="R"/></div></div></div>`);
    expect(collectData(document.querySelector<HTMLElement>('.crudui-form__body')!, undefined))
      .toStrictEqual({ name: 'Ada', rows: { [first]: 'R' } });
  });

  it('creates members named like object prototype members as own members', () => {
    const { document } = documentOf(
      '<div class="crudui-form__body"><div data-field-path="__proto__"><input name="form[__proto__][polluted]" value="x"/></div></div>');
    const data = collectData(document.querySelector<HTMLElement>('.crudui-form__body')!, 'form');
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.keys(data)).toStrictEqual(['__proto__']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  for (const [names, message] of [
    [['form[a]]'], 'Malformed control name: form[a]]'],
    [['form[a][][b]'], 'Malformed control name: form[a][][b]'],
    [['form'], 'Malformed control name: form'],
    [['other[a]'], 'Control name outside the key prefix: other[a]'],
    [['form[a]', 'form[a][b]'], 'Control name is both a value and a group: form[a][b]'],
    [['form[a][b]', 'form[a]'], 'Control name is both a value and a group: form[a]'],
    [['form[a][]', 'form[a][b]'], 'Control name is both a value and a group: form[a][b]'],
    [['form[a]', 'form[a][]'], 'Control name is both a value and a group: form[a][]'],
    [['form[a]', 'form[a]'], 'Repeated control name: form[a]'],
  ] as const) {
    it(`fails on ${names.join(', ')}`, () => {
      const inputs = names.map(name => `<input name="${name}" value="v"/>`).join('');
      const { document } = documentOf(`<div class="crudui-form__body"><div data-field-path="a">${inputs}</div></div>`);
      const run = () => collectData(document.querySelector<HTMLElement>('.crudui-form__body')!, 'form');
      expect(run).toThrow(message);
      try { run(); } catch (error) { expect((error as { code?: string }).code).toBe('INVALID_FORM_INPUT'); }
    });
  }
});
