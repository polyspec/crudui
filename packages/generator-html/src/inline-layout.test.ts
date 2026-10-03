/**
 * Layout (docs/spec/form-markup.md, Layout): the HTML renderer writes the inline and line
 * modifiers of the node model on the node roots.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from './index';

const render = (properties: Record<string, unknown>) =>
  renderForm(createForm(compileForm({ type: 'group', properties }), {}, { language: 'en' }));

describe('layout bytes of the HTML renderer', () => {
  const html = () => render({
    look: {
      type: 'group',
      label: 'Look',
      design: { layout: 'inline' },
      properties: {
        theme: { type: 'text', label: 'Theme', description: 'Applies to every window.' },
        font: { type: 'group', label: 'Font', design: { layout: 'line' }, properties: { family: { type: 'text' } } },
      },
    },
  });

  test('a field node of an inline group writes the inline modifier', () => {
    expect(html()).toContain(
      '<div class="crudui-node crudui-node--field crudui-node--inline" data-field-path="look.theme"><div class="crudui-node__header">' +
      '<label class="crudui-node__label" for="crudui:look.theme">Theme</label><p class="crudui-node__description">Applies to every window.</p></div>');
  });

  test('a line group writes the line modifier and its children write none', () => {
    expect(html()).toContain(
      '<div class="crudui-node crudui-node--group crudui-node--inline crudui-node--line" data-field-path="look.font"><div class="crudui-node__header">' +
      '<span class="crudui-node__label">Font</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--field" data-field-path="look.font.family">');
  });
});
