/**
 * Complete form conformance (form-runtime.md, "Complete form"): Svelte server rendering of the
 * shared cases in tests/fixtures/form-complete/cases.json. Svelte writes its own serialization with hydration markers, so
 * the output and `expected_html` are compared after the shared normalization; an option outside
 * the contract fails with the declared code and message.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import { renderForm } from '../src/index.ts';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../../tests/fixtures/form-complete/cases.json'), 'utf8'));

describe('complete form: Svelte writes the expected markup or the declared failure', () => {
  for (const c of cases) {
    test(c.name, () => provesConformance(
      { features: ['renderForm'], fixture: 'tests/fixtures/form-complete/cases.json', runtime: 'svelte', case: c.name },
      async () => {
        const form = createForm(compileForm(c.spec), c.data, c.options);
        if (c.expectError) {
          let thrown;
          try { await renderForm(form, c.render); } catch (error) { thrown = error; }
          expect({ code: thrown?.code, message: thrown?.message }).toStrictEqual(c.expectError);
        } else {
          expect(normalizeHtml(await renderForm(form, c.render))).toBe(normalizeHtml(c.expected_html));
        }
      },
    ));
  }
});
