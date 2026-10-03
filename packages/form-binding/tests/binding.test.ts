// Timing, error display, submission and options of the browser validation binding
// (form-runtime.md, "Browser validation").
import { validate } from '@crudui/validator';
import { describe, expect, it } from 'vitest';

import { bindForm } from '../src/index';
import { control, leave, node, nodeErrors, renderedForm, type } from './dom';

const spec = {
  type: 'group',
  properties: {
    email: { type: 'email', label: 'Email', validate: { required: true, email: true } },
    name: { type: 'text', label: 'Name', validate: { required: true, minlength: 2 } },
    agree: { type: 'checkbox', label: 'Agree', validate: { required: true } },
  },
};
const invalidEmail = 'Please enter a valid email address.';
const requiredText = 'This field is required.';

function setup(data: Record<string, unknown> = {}, render = {}) {
  const page = renderedForm(spec, data, render);
  const binding = bindForm(page.form, spec, { keyPrefix: 'form' });
  return { ...page, binding };
}

function submit(window: ReturnType<typeof setup>['window'], form: HTMLFormElement): Event {
  const event = new window.SubmitEvent('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

describe('timing', () => {
  it('writes nothing while the user types before leaving the control', () => {
    const { window, form } = setup();
    type(window, control(form, 'form[email]'), 'x');
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(control(form, 'form[email]').hasAttribute('aria-invalid')).toBe(false);
  });

  it('validates a changed node when its control loses focus, and only that node', () => {
    const { window, form } = setup();
    type(window, control(form, 'form[email]'), 'x');
    leave(control(form, 'form[email]'));
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([invalidEmail]);
    expect(control(form, 'form[email]').getAttribute('aria-invalid')).toBe('true');
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([]);
    expect(nodeErrors(node(form, 'agree'))).toStrictEqual([]);
  });

  it('validates nothing when an unchanged control loses focus', () => {
    const { form } = setup();
    control(form, 'form[name]').focus();
    leave(control(form, 'form[name]'));
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([]);
  });

  it('validates a validated node on every later input and removes its errors when it is corrected', () => {
    const { window, form } = setup();
    const email = control(form, 'form[email]');
    type(window, email, 'x');
    leave(email);
    type(window, email, '');
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([requiredText]);
    type(window, email, 'ada@example.com');
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('validates a checkbox node on its change after it was validated', () => {
    const { window, form } = setup();
    const agree = control(form, 'form[agree]');
    agree.focus();
    agree.checked = true;
    agree.dispatchEvent(new window.Event('change', { bubbles: true }));
    leave(agree);
    expect(nodeErrors(node(form, 'agree'))).toStrictEqual([]);
    agree.checked = false;
    agree.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(nodeErrors(node(form, 'agree'))).toStrictEqual([requiredText]);
    expect(agree.getAttribute('aria-invalid')).toBe('true');
  });

  it('writes every node validated before at each node validation', () => {
    const { window, form } = setup();
    const email = control(form, 'form[email]');
    const name = control(form, 'form[name]');
    type(window, email, 'x');
    leave(email);
    type(window, name, 'A');
    leave(name);
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([invalidEmail]);
    expect(nodeErrors(node(form, 'name'))).toStrictEqual(['Please enter at least 2 characters.']);
    type(window, email, 'ada@example.com');
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(nodeErrors(node(form, 'name'))).toStrictEqual(['Please enter at least 2 characters.']);
  });
});

describe('submission', () => {
  it('cancels an invalid submission before every other listener and focuses the first invalid control', () => {
    const { window, document, form } = setup({ email: 'ada@example.com' });
    const heard: string[] = [];
    document.addEventListener('submit', () => heard.push('document capture'), { capture: true });
    form.addEventListener('submit', () => heard.push('form'));
    document.addEventListener('submit', () => heard.push('document'));
    const event = submit(window, form);
    expect(event.defaultPrevented).toBe(true);
    expect(heard).toStrictEqual([]);
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([requiredText]);
    expect(nodeErrors(node(form, 'agree'))).toStrictEqual([requiredText]);
    expect(document.activeElement).toBe(control(form, 'form[name]'));
  });

  it('lets a valid submission reach every listener', () => {
    const { window, document, form } = setup({ email: 'ada@example.com', name: 'Ada', agree: '1' });
    const heard: string[] = [];
    form.addEventListener('submit', (event) => { heard.push('form'); event.preventDefault(); });
    document.addEventListener('submit', () => heard.push('document'));
    submit(window, form);
    expect(heard).toStrictEqual(['form', 'document']);
  });

  it('validates every node after a submission, so each later input validates', () => {
    const { window, form } = setup();
    submit(window, form);
    type(window, control(form, 'form[name]'), 'Ada');
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([]);
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([requiredText]);
  });

  it('focuses past a control inside a hidden element', () => {
    const { window, document, form } = setup({ email: 'ada@example.com' });
    node(form, 'name').querySelector<HTMLElement>('.crudui-node__body')!.hidden = true;
    submit(window, form);
    expect(document.activeElement).toBe(control(form, 'form[agree]'));
  });

  it('ignores the submission of another form', () => {
    const { window, document, form } = setup();
    const other = document.createElement('form');
    document.body.append(other);
    const event = submit(window, other);
    expect(event.defaultPrevented).toBe(false);
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([]);
  });
});

describe('errors', () => {
  it('keeps server errors until the first validation of their node and form errors until the whole form validates', () => {
    const { window, form, binding } = setup({ email: 'x' }, {
      errors: [{ path: 'email', message: 'Server email' }, { path: 'name', message: 'Server name' }],
      formErrors: ['Server form'],
    });
    const email = control(form, 'form[email]');
    type(window, email, 'ada@example.com');
    leave(email);
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(nodeErrors(node(form, 'name'))).toStrictEqual(['Server name']);
    expect(form.querySelectorAll('.crudui-form__error')).toHaveLength(1);
    binding.validate();
    expect(nodeErrors(node(form, 'name'))).toStrictEqual([requiredText]);
    expect(form.querySelector('.crudui-form__errors')).toBeNull();
  });

  it('writes the texts of message and formErrors', () => {
    const { form } = renderedForm(spec, {});
    const binding = bindForm(form, spec, {
      keyPrefix: 'form',
      message: (error) => `${error.field}:${error.rule}`,
      formErrors: (result) => (result.valid ? [] : ['Check the marked fields.', 'Then save.']),
    });
    binding.validate();
    expect(nodeErrors(node(form, 'email'))).toStrictEqual(['email:required']);
    const errors = form.querySelector('.crudui-form__errors')!;
    expect(errors.nextElementSibling?.classList.contains('crudui-form__body')).toBe(true);
    expect(Array.from(errors.children, (paragraph) => [paragraph.className, paragraph.textContent]))
      .toStrictEqual([['crudui-form__error', 'Check the marked fields.'], ['crudui-form__error', 'Then save.']]);
  });

  it('returns the validator result for the collected data', () => {
    const { binding } = setup({ email: 'x', name: 'A' });
    expect(binding.validate()).toStrictEqual(validate(spec, { email: 'x', name: 'A' }));
  });

  it('removes the errors of a node that contains a file control', () => {
    const fileSpec = {
      type: 'group',
      properties: { photo: { type: 'file', validate: { required: true } }, name: { type: 'text', validate: { required: true } } },
    };
    const { form } = renderedForm(fileSpec, { name: 'Ada' });
    expect(bindForm(form, fileSpec, { keyPrefix: 'form' }).validate()).toStrictEqual({ valid: true, errors: [] });
    expect(nodeErrors(node(form, 'photo'))).toStrictEqual([]);
  });

  it('leaves the hidden inputs of the form element out of the data', () => {
    const { binding } = setup({ email: 'ada@example.com', name: 'Ada', agree: '1' }, { hidden: { _csrf: 'token' } });
    expect(binding.validate()).toStrictEqual({ valid: true, errors: [] });
  });

  it('fails on an error whose path names no node', () => {
    const { form } = renderedForm(spec, {});
    const wider = { ...spec, properties: { ...spec.properties, missing: { type: 'text', validate: { required: true } } } };
    expect(() => bindForm(form, wider, { keyPrefix: 'form' }).validate()).toThrow('Unknown error path: missing');
  });

  it('fails when message or formErrors returns another value', () => {
    const { form } = renderedForm(spec, {});
    expect(() => bindForm(form, spec, { keyPrefix: 'form', message: () => 1 as unknown as string }).validate())
      .toThrow(new TypeError('message must return a string'));
    expect(() => bindForm(form, spec, { keyPrefix: 'form', formErrors: () => [1] as unknown as string[] }).validate())
      .toThrow(new TypeError('formErrors must return a list of strings'));
  });
});

describe('binding', () => {
  it('sets novalidate, and removes it and every listener on dispose', () => {
    const { window, form, binding } = setup();
    expect(form.hasAttribute('novalidate')).toBe(true);
    binding.dispose();
    expect(form.hasAttribute('novalidate')).toBe(false);
    const email = control(form, 'form[email]');
    type(window, email, 'x');
    leave(email);
    expect(nodeErrors(node(form, 'email'))).toStrictEqual([]);
    expect(submit(window, form).defaultPrevented).toBe(false);
  });

  it('keeps a novalidate the form had on dispose', () => {
    const { form } = renderedForm(spec, {});
    form.noValidate = true;
    bindForm(form, spec, { keyPrefix: 'form' }).dispose();
    expect(form.hasAttribute('novalidate')).toBe(true);
  });

  it('rejects invalid arguments in the documented order', () => {
    const { document, form } = renderedForm(spec, {});
    const empty = document.createElement('form');
    const twice = document.createElement('form');
    twice.innerHTML = '<div class="crudui-form__body"></div><div class="crudui-form__body"></div>';
    const cases: Array<[() => unknown, string]> = [
      [() => bindForm(document.createElement('div') as unknown as HTMLFormElement, spec), 'bindForm requires a form element'],
      [() => bindForm(form, spec, null as unknown as object), 'Binding options must be an object'],
      [() => bindForm(form, spec, { other: 1, keyPrefix: 1 } as unknown as object), 'Unknown binding option: other'],
      [() => bindForm(form, spec, { keyPrefix: 1 } as unknown as object), 'keyPrefix must be a string'],
      [() => bindForm(form, spec, { message: 'x' } as unknown as object), 'message must be a function'],
      [() => bindForm(form, spec, { formErrors: [] } as unknown as object), 'formErrors must be a function'],
      [() => bindForm(empty, spec), 'The form must contain one CRUDUI form'],
      [() => bindForm(twice, spec), 'The form must contain one CRUDUI form'],
    ];
    for (const [run, message] of cases) expect(run).toThrow(new TypeError(message));
  });
});
