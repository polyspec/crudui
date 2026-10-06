// The display of the browser validation binding (form-runtime.md, "Display"): the nodes whose
// design.show reads another field appear and disappear with the data, a node that becomes hidden
// loses its errors, and no value changes.
import { describe, expect, it } from 'vitest';

import { bindForm } from '../src/index';
import { control, node, nodeErrors, renderedForm, type } from './dom';

const spec = {
  type: 'group',
  properties: {
    render: { type: 'select', label: 'Render', items: [{ value: 'ssr', label: 'Server' }, { value: 'csr', label: 'Browser' }] },
    modes: {
      type: 'group',
      label: 'Modes',
      design: { show: ".render != 'csr'" },
      properties: {
        navigation: { type: 'text', label: 'Navigation', validate: { required: true } },
        note: { type: 'text', label: 'Note', design: { show: ".navigation == 'swap'" } },
      },
    },
    rows: {
      type: 'group',
      label: 'Rows',
      multiple: true,
      properties: {
        mode: { type: 'text', label: 'Mode' },
        extra: { type: 'text', label: 'Extra', design: { show: ".mode == 'x'" } },
      },
    },
  },
};
const requiredText = 'This field is required.';

function setup(data: Record<string, unknown>) {
  const page = renderedForm(spec, data);
  const binding = bindForm(page.form, spec, { keyPrefix: 'form' });
  return { ...page, binding };
}

function choose(window: ReturnType<typeof setup>['window'], select: HTMLSelectElement, value: string): void {
  select.focus();
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('display', () => {
  it('hides and shows a group when the field its design.show reads changes', () => {
    const { window, form } = setup({ render: 'ssr', modes: { navigation: 'document' } });
    expect(node(form, 'modes').hidden).toBe(false);
    choose(window, control<HTMLSelectElement>(form, 'form[render]'), 'csr');
    expect(node(form, 'modes').hidden).toBe(true);
    choose(window, control<HTMLSelectElement>(form, 'form[render]'), 'ssr');
    expect(node(form, 'modes').hidden).toBe(false);
  });

  it('shows a field on input of the text its condition reads, inside a group and inside a row', () => {
    const { window, form } = setup({ render: 'ssr', modes: { navigation: 'document' }, rows: { __a__: { mode: 'y' } } });
    expect(node(form, 'modes.note').hidden).toBe(true);
    expect(node(form, 'rows.__a__.extra').hidden).toBe(true);
    type(window, control(form, 'form[modes][navigation]'), 'swap');
    type(window, control(form, 'form[rows][__a__][mode]'), 'x');
    expect(node(form, 'modes.note').hidden).toBe(false);
    expect(node(form, 'rows.__a__.extra').hidden).toBe(false);
  });

  it('writes the display of the data when it binds', () => {
    const page = renderedForm(spec, { render: 'ssr', modes: { navigation: 'document' } });
    control<HTMLSelectElement>(page.form, 'form[render]').value = 'csr';
    bindForm(page.form, spec, { keyPrefix: 'form' });
    expect(node(page.form, 'modes').hidden).toBe(true);
  });

  it('removes the errors of a node that becomes hidden and of the nodes inside it, and keeps every value', () => {
    const { window, form, binding } = setup({ render: 'ssr', modes: { navigation: '' } });
    expect(binding.validate().valid).toBe(false);
    expect(nodeErrors(node(form, 'modes.navigation'))).toStrictEqual([requiredText]);
    choose(window, control<HTMLSelectElement>(form, 'form[render]'), 'csr');
    expect(nodeErrors(node(form, 'modes.navigation'))).toStrictEqual([]);
    expect(control(form, 'form[modes][navigation]').hasAttribute('aria-invalid')).toBe(false);
    expect(control(form, 'form[modes][navigation]').value).toBe('');
    expect(binding.validate().valid).toBe(true);
  });
});
