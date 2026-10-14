// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { bindForm, compileForm, connectForm, createForm } from './index';

/**
 * connectForm().sync() writes the live value of a control from the form value. It must write the
 * string that the server render writes for the same value: the widget evaluators of widget.ts
 * convert a value with phpString of util.ts (applyDefaultString for a text value, effectiveValue
 * for a choice), so true is '1', false is '' and an object or array is ''.
 */
describe('connectForm writes the same control value as the server render', () => {
  const template = compileForm({ type: 'group', properties: {
    yes: { type: 'text' }, no: { type: 'text' }, object: { type: 'text' }, note: { type: 'textarea' },
    choice: { type: 'radio', items: { '1': 'One', '': 'None' } },
  } }, { keyPrefix: 'form' });

  test.each([
    ['true', true],
    ['false', false],
    ['an object', { x: 1 }],
  ])('a text, textarea and radio control of %s', (_name, value) => {
    const data = { yes: value, no: value, object: value, note: value, choice: value };
    const server = bindForm(template, data);
    const element = document.createElement('div');
    element.innerHTML = '<input type="text" name="form[yes]"><input type="text" name="form[no]">'
      + '<input type="text" name="form[object]"><textarea name="form[note]"></textarea>'
      + '<input type="radio" name="form[choice]" value="1"><input type="radio" name="form[choice]" value="">';
    document.body.append(element);
    const connection = connectForm(element, createForm(template, data));
    const controls = Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type=text],textarea'));
    expect(controls.map(control => control.value)).toEqual(server.slice(0, 4).map(field =>
      field.widget.tag === 'textarea' ? field.widget.text : field.widget.attrs.value));
    const radios = Array.from(element.querySelectorAll<HTMLInputElement>('input[type=radio]'));
    expect(radios.map(radio => radio.checked)).toEqual(server[4]!.widget.options!.map(option => option.selected));
    connection.disconnect();
    element.remove();
  });
});
