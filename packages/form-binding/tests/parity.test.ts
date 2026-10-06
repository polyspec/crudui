// The error markup the binding writes into a rendered form equals the markup renderForm writes
// for the same errors and form errors (form-runtime.md, "Error display"). The cases are the
// invalid cases of the shared validation fixture whose data a rendered form holds exactly: the
// binding collects that data from the form, so its validation result is the fixture's result.
import { readFileSync } from 'node:fs';

import type { ValidationResult } from '@polyspec/crudui-validator';
import { describe, expect, it } from 'vitest';

import { collectData } from '../src/data';
import { bindForm } from '../src/index';
import { documentOf, formHtml } from './dom';

interface Case {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  // A case that expects a load or input failure has no expected result.
  expected?: ValidationResult;
}

const cases = JSON.parse(readFileSync(new URL('../../../tests/fixtures/validate/cases.json', import.meta.url), 'utf8')) as Case[];
const formErrors = (result: ValidationResult) => (result.valid ? [] : ['Check the marked fields.']);

/** The form of a case, parsed, when the case's data renders and a rendered form holds it exactly. */
function holdsData(item: Case): boolean {
  if (item.expected?.valid !== false) return false;
  let html: string;
  try { html = formHtml(item.spec, item.data); } catch { return false; }
  const form = documentOf(html).document.querySelector('form')!;
  return JSON.stringify(collectData(form.querySelector<HTMLElement>('.crudui-form__body')!, 'form')) === JSON.stringify(item.data);
}

const selected = cases.filter(holdsData);

/** The form's content with every `aria-invalid` attribute removed, and the controls that had one. */
function withoutInvalidMarks(form: HTMLFormElement): { html: string; invalid: string[] } {
  const invalid = Array.from(form.querySelectorAll<HTMLInputElement>('[aria-invalid]'), (element) => {
    expect(element.getAttribute('aria-invalid')).toBe('true');
    element.removeAttribute('aria-invalid');
    return `${element.name}=${element.value}`;
  });
  return { html: form.innerHTML, invalid };
}

describe('error markup parity with renderForm', () => {
  it('selects the invalid fixture cases whose data a rendered form holds', () => {
    expect(selected.length).toBeGreaterThanOrEqual(50);
  });

  for (const item of selected) {
    it(item.name, () => {
      const { document } = documentOf(formHtml(item.spec, item.data));
      const form = document.querySelector('form')!;
      const result = bindForm(form, item.spec, { keyPrefix: 'form', formErrors }).validate();
      expect(result).toStrictEqual(item.expected);

      const expected = documentOf(formHtml(item.spec, item.data, { errors: result.errors, formErrors: formErrors(result) }))
        .document.querySelector('form')!;
      const actual = withoutInvalidMarks(form);
      expect(actual.html).toBe(expected.innerHTML);
      expect(form.noValidate).toBe(true);

      // Every control of a node with errors, and no other control, is marked invalid.
      const failing = new Set(result.errors.map((error) => error.path));
      const marked = Array.from(expected.querySelectorAll<HTMLInputElement>('input[name], select[name], textarea[name]'))
        .filter((element) => {
          const owner = element.closest<HTMLElement>('[data-field-path], [data-crudui-row-key]');
          if (!owner || element.type === 'file' || element.disabled) return false;
          const path = owner.dataset.fieldPath
            ?? `${owner.parentElement!.closest<HTMLElement>('[data-field-path]')!.dataset.fieldPath}.${owner.getAttribute('data-crudui-row-key')}`;
          return failing.has(path);
        })
        .map((element) => `${element.name}=${element.value}`);
      expect(actual.invalid).toStrictEqual(marked);
    });
  }
});
