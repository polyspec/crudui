/**
 * Complete form conformance (form-runtime.md, "Complete form"): the HTML renderer writes the
 * bytes of every shared case in tests/fixtures/form-complete/cases.json, and an option outside
 * the contract fails with the declared code and message. `renderFormView` writes the same
 * markup from `bindForm`, `bindButtons` and `formDescription` for a template without an `action`.
 */
import { describe, expect, test } from 'vitest';
import { bindButtons, bindForm, compileForm, createForm, formDescription, formMessages, type Language } from '@polyspec/crudui-generator-core';
import { renderForm, renderFormView } from './index';
import fixtureCases from '../../../tests/fixtures/form-complete/cases.json';
import { provesConformance } from '../../../tests/conformance/evidence.mts';
import { checked, renderOptionsSchema } from '../../../tests/json.mts';

interface CompleteCase {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  options: { language: string };
  render: unknown;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const cases: CompleteCase[] = fixtureCases;

/** The language of the options of a case, one that the generator has messages for. */
function caseOptions(c: CompleteCase): { language: Language } {
  const { language } = c.options;
  if (language === 'ko' || language === 'en' || language === 'ja' || language === 'zh') return { language };
  throw new Error(`${c.name}: no language of the generator: ${language}`);
}

function failure(render: () => unknown): unknown {
  try { render(); } catch (error) { return error; }
  return undefined;
}

/**
 * renderForm with the render options of a case that fails, called as a JavaScript caller does (Reflect.apply): they hold
 * values that the type of the options rejects and renderForm checks at run time.
 */
function renderFailingCase(form: ReturnType<typeof createForm>, render: unknown): unknown {
  return Reflect.apply(renderForm, undefined, [form, render]);
}

describe('complete form: the HTML renderer writes the expected bytes or the declared failure', () => {
  for (const c of cases) {
    test(c.name, () => provesConformance(
      { features: ['renderForm'], fixture: 'tests/fixtures/form-complete/cases.json', runtime: 'javascript-html', case: c.name },
      () => {
        const form = createForm(compileForm(c.spec), c.data, caseOptions(c));
        if (c.expectError) expect(failure(() => renderFailingCase(form, c.render))).toMatchObject(c.expectError);
        else expect(renderForm(form, checked(c.render, renderOptionsSchema, c.name))).toBe(c.expected_html);
      },
    ));
  }
});

describe('complete form: renderFormView writes the same markup from bound nodes', () => {
  for (const c of cases.filter((x) => !x.expectError && !('action' in x.spec))) {
    test(c.name, () => {
      const template = compileForm(c.spec);
      const options = caseOptions(c);
      const html = renderFormView(bindForm(template, c.data, options), bindButtons(template, c.data, options),
        formMessages(options.language), checked(c.render, renderOptionsSchema, c.name), formDescription(template, options));
      expect(html).toBe(c.expected_html);
    });
  }
});
