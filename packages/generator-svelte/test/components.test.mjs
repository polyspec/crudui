import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import TextField from '../src/legacy/components/fields/TextField.svelte';
import CheckboxField from '../src/legacy/components/fields/CheckboxField.svelte';
import FormField from '../src/legacy/components/FormField.svelte';
import FormGroup from '../src/legacy/components/FormGroup.svelte';

describe('component smoke', () => {
  it('TextField renders an input-group with the field input', () => {
    const { body } = render(TextField, { props: { spec: { type: 'text', label: 'Name' }, path: 'name', keyPrefix: '' } });
    expect(body).toContain('class="input-group"');
    expect(body).toContain('name="name"');
    expect(body).toContain('valid-target form-control');
  });
  it('CheckboxField renders div>input+span', () => {
    const { body } = render(CheckboxField, { props: { spec: { type: 'checkbox', label: 'Ok' }, path: 'ok' } });
    expect(body).toContain('type="checkbox"');
    expect(body).toContain('<span>Ok</span>');
  });
  it('FormField wraps a leaf field with form-element-wrapper', () => {
    const { body } = render(FormField, { props: { name: 'email', spec: { type: 'email', label: 'Email' }, path: 'email', rootSpec: { key: '' } } });
    expect(body).toContain('form-element-wrapper');
    expect(body).toContain('name="email-layer"');
    expect(body).toContain('type="email"');
  });
  it('FormGroup renders a group wrapper with nested fields', () => {
    const spec = { type: 'group', label: 'G', properties: { a: { type: 'text' } } };
    const { body } = render(FormGroup, { props: { name: 'g', spec, path: 'g', rootSpec: { key: '' } } });
    expect(body).toContain('form-element-wrapper');
    expect(body).toContain('class="form-group"');
    expect(body).toContain('name="g.a-layer"');
  });
});
