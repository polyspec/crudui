/**
 * Complete form conformance (form-runtime.md, "Complete form"): the HTML renderer writes the
 * bytes of every shared case in tests/fixtures/form-complete/cases.json, and an option outside
 * the contract fails with the declared code and message. `renderFormView` writes the same
 * markup from `bindForm`, `bindButtons` and `formDescription` for a template without an `action`.
 */
import { describe, expect, test } from 'vitest';
import { bindButtons, bindForm, compileForm, createForm, formDescription, formMessages } from '@crudui/generator-core';
import { renderForm, renderFormView } from './index';
import fixtureCases from '../../../tests/fixtures/form-complete/cases.json';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

interface CompleteCase {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  options: { language: 'en' };
  render: unknown;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const cases = fixtureCases as unknown as CompleteCase[];

function failure(render: () => string): { code?: string; message?: string } {
  try { render(); } catch (error) { return { code: (error as { code?: string }).code, message: (error as Error).message }; }
  return {};
}

describe('complete form: the HTML renderer writes the expected bytes or the declared failure', () => {
  for (const c of cases) {
    test(c.name, () => provesConformance(
      { features: ['renderForm'], fixture: 'tests/fixtures/form-complete/cases.json', runtime: 'javascript-html', case: c.name },
      () => {
        const form = createForm(compileForm(c.spec), c.data, c.options);
        if (c.expectError) expect(failure(() => renderForm(form, c.render as never))).toStrictEqual(c.expectError);
        else expect(renderForm(form, c.render as never)).toBe(c.expected_html);
      },
    ));
  }
});

describe('complete form: renderFormView writes the same markup from bound nodes', () => {
  for (const c of cases.filter((x) => !x.expectError && !('action' in (x.spec as object)))) {
    test(c.name, () => {
      const template = compileForm(c.spec);
      const html = renderFormView(bindForm(template, c.data, c.options), bindButtons(template, c.data, c.options),
        formMessages(c.options.language), c.render as never, formDescription(template, c.options));
      expect(html).toBe(c.expected_html);
    });
  }
});
