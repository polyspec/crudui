/**
 * Complete form conformance (form-runtime.md, "Complete form"): the shared cases of
 * tests/fixtures/form-complete/cases.json through React's server rendering. React is the byte
 * reference, so its output equals `expected_html` exactly, and an option outside the contract
 * fails with the declared code and message.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { renderForm } from '../server';
import fixtureCases from '../../../../tests/fixtures/form-complete/cases.json';
import { provesConformance } from '../../../../tests/conformance/evidence.mts';

interface CompleteCase {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
  render: unknown;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const cases: CompleteCase[] = fixtureCases;

/**
 * renderForm with the render options of a case, called as a JavaScript caller does (Reflect.apply): they are JSON that
 * renderForm checks, and the failing cases hold values that its type rejects.
 */
function renderCase(form: ReturnType<typeof createForm>, render: unknown): unknown {
  return Reflect.apply(renderForm, undefined, [form, render]);
}

describe('complete form: React writes the expected bytes or the declared failure', () => {
  for (const c of cases) {
    test(c.name, () => provesConformance(
      { features: ['renderForm'], fixture: 'tests/fixtures/form-complete/cases.json', runtime: 'react', case: c.name },
      () => {
        const form = createForm(compileForm(c.spec), c.data, c.options);
        if (c.expectError) {
          let thrown: unknown;
          try { renderCase(form, c.render); } catch (error) { thrown = error; }
          expect(thrown).toBeInstanceOf(Error);
          expect(thrown).toMatchObject(c.expectError);
        } else {
          expect(renderCase(form, c.render)).toBe(c.expected_html);
        }
      },
    ));
  }
});
