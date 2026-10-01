/**
 * Complete form conformance (form-runtime.md, "Complete form"): the shared cases of
 * tests/fixtures/form-complete/cases.json through React's server rendering. React is the byte
 * reference, so its output equals `expected_html` exactly, and an option outside the contract
 * fails with the declared code and message.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '../server';
import fixtureCases from '../../../../tests/fixtures/form-complete/cases.json';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

interface CompleteCase {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
  render: unknown;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const cases = fixtureCases as unknown as CompleteCase[];

describe('complete form: React writes the expected bytes or the declared failure', () => {
  for (const c of cases) {
    test(c.name, () => provesConformance(
      { features: ['renderForm'], fixture: 'tests/fixtures/form-complete/cases.json', runtime: 'react', case: c.name },
      () => {
        const form = createForm(compileForm(c.spec), c.data, c.options);
        if (c.expectError) {
          let thrown: { code?: string; message?: string } | undefined;
          try { renderForm(form, c.render as never); } catch (error) { thrown = error as typeof thrown; }
          expect({ code: thrown?.code, message: thrown?.message }).toStrictEqual(c.expectError);
        } else {
          expect(renderForm(form, c.render as never)).toBe(c.expected_html);
        }
      },
    ));
  }
});
