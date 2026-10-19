/**
 * React's server output is the reference serialization of declared attributes
 * (docs/spec/form-markup.md, Declared attributes): they follow the attributes crudui writes, with
 * React's own placement of `style`, `name`, `checked` and `value`, and follow `hidden` on a node.
 */
import { describe, expect, test } from 'vitest';
import { compileForm } from '@polyspec/crudui-generator-core';
import { renderFields } from '../internal/renderFields';

const render = (field: Record<string, unknown>, data: Record<string, unknown> = {}) =>
  renderFields(compileForm({ type: 'group', properties: { theme: field } }), { language: 'en', data });

describe('declared attribute bytes in the reference serialization', () => {
  test('a text control writes them before name and value', () => {
    expect(render({ type: 'text', design: { attributes: { 'data-setting': 'theme', 'aria-describedby': 'theme-help' } } })).toContain(
      '<input type="text" class="valid-target crudui-input" data-name="theme" data-rule-name="theme" data-default="" id="crudui:theme" data-setting="theme" aria-describedby="theme-help" name="theme" value=""/>');
  });

  test('a node root writes them after hidden', () => {
    expect(render({ type: 'text', design: { show: false, wrapper: { attributes: { 'data-section': 'look' } } } })).toContain(
      '<div class="crudui-node crudui-node--field" data-field-path="theme" hidden="" data-section="look">');
  });

  test('a checkbox writes them before name, checked and value', () => {
    expect(render({ type: 'checkbox', label: 'Dark', design: { attributes: { 'aria-describedby': 'help' } } }, { theme: true })).toContain(
      '<input class="valid-target" id="crudui:theme" type="checkbox" aria-describedby="help" name="theme" checked="" value="1"/>');
  });

  test('an option input with behavior attributes writes them after checked', () => {
    expect(render({ type: 'choice', items: { a: 'A' }, behavior: { onchange: 'go()' }, design: { attributes: { 'data-x': '1' } } }, { theme: 'a' })).toContain(
      '<input name="theme" data-name="theme" data-rule-name="theme" onchange="go()" type="radio" value="a" autocomplete="off" class="valid-target crudui-choices__input" id="crudui:theme:0" data-is-default="" checked="" data-x="1">');
  });
});
