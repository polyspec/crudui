/**
 * CRUDUI form-spec meta-schema conformance.
 *
 * This test compiles the form entry point of schema/crudui.schema.json with the
 * same Ajv configuration as scripts/check-schema.mjs
 * (`new Ajv({ strict:false, allErrors:true })` + ajv-formats) and runs the shared
 * fixture tests/fixtures/spec-validity. Each case declares the meta-schema result
 * in `expect`; a `fail` case names in `reason` the Ajv keyword that must appear
 * among the errors. The runtime result in `engine` is checked by
 * forbidden-scan.conformance.test.ts.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/crudui.schema.json'), 'utf8'));
const FIXTURE = path.join(ROOT, 'tests/fixtures/spec-validity/cases.json');

interface SpecValidityCase {
  name: string;
  note: string;
  expect: 'ok' | 'fail';
  reason?: string;
  spec: Record<string, unknown>;
}

const cases: SpecValidityCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validateForm = ajv.compile(schema);

describe('form meta-schema — cases expected to pass', () => {
  for (const c of cases.filter((x) => x.expect === 'ok')) {
    test(c.name, () => {
      const ok = validateForm(c.spec);
      expect(ok, `${c.name} should validate but did not: ${JSON.stringify(validateForm.errors)}`).toBe(true);
    });
  }
});

describe('form meta-schema — cases expected to fail for their reason', () => {
  for (const c of cases.filter((x) => x.expect === 'fail')) {
    test(c.name, () => {
      const ok = validateForm(c.spec);
      expect(ok, `${c.name} must be rejected by the meta-schema`).toBe(false);
      const keywords = (validateForm.errors ?? []).map((e) => e.keyword);
      expect(keywords, `${c.name}: expected '${c.reason}' among ${JSON.stringify(keywords)}`).toContain(c.reason);
    });
  }
});
