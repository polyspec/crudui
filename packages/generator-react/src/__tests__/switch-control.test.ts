/**
 * Switches (docs/spec/form-markup.md, Switches): React's server rendering writes a switcher as a
 * checkbox input with the switch role, the switch class and the declared attributes, with the
 * bytes of the HTML renderer.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm as htmlForm } from '@crudui/generator-html';
import { renderForm } from '../server';

const form = (field: Record<string, unknown>, data: Record<string, unknown>) =>
  createForm(compileForm({ type: 'group', properties: { on: field } }), data, { language: 'en' });

describe('switch output of React', () => {
  test('a switcher with declared attributes writes the bytes of the HTML renderer', () => {
    const switcher = form({ type: 'switcher', label: 'Sync', design: { attributes: { 'data-setting': 'sync' } } }, { on: true });
    expect(renderForm(switcher)).toContain(
      '<input class="valid-target crudui-input crudui-input--switch" id="crudui:on" type="checkbox" role="switch" data-setting="sync" name="on" checked="" value="1"/>');
    expect(renderForm(switcher)).toBe(htmlForm(switcher));
  });
});
