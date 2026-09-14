import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { Form } from './Form';

describe('React form button rendering', () => {
  test('allows a host form to own submit controls', () => {
    const form = createForm(compileForm({ type: 'group', properties: { name: { type: 'text' } } }), {});
    const html = renderToStaticMarkup(<Form form={form} renderButtons={false} />);
    expect(html).toContain('crudui-form__body');
    expect(html).not.toContain('crudui-form__footer');
    expect(html).not.toContain('crudui-action');
  });
});
