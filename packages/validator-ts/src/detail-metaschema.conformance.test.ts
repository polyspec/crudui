/**
 * CRUDUI detail-spec meta-schema conformance.
 *
 * This test compiles `#/definitions/Detail` from schema/crudui.schema.json with the
 * same Ajv configuration as scripts/check-schema.mjs
 * (`new Ajv({ strict:false, allErrors:true })` + ajv-formats) and runs the shared
 * fixture tests/fixtures/detail-validity. Each case declares the meta-schema result
 * in `expect`; a `fail` case names in `reason` the Ajv keyword that must appear
 * among the errors. The runtime result in `engine` is checked by
 * validate-detail/validate-detail.conformance.test.ts.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/crudui.schema.json'), 'utf8'));
const FIXTURE = path.join(ROOT, 'tests/fixtures/detail-validity/cases.json');

interface DetailValidityCase {
  name: string;
  note: string;
  expect: 'ok' | 'fail';
  reason?: string;
  spec: Record<string, unknown>;
}

const cases: DetailValidityCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validateDetail = ajv.compile({
  $schema: schema.$schema,
  definitions: schema.definitions,
  $ref: '#/definitions/Detail',
});

describe('detail meta-schema — cases expected to pass', () => {
  for (const c of cases.filter((x) => x.expect === 'ok')) {
    test(c.name, () => {
      const ok = validateDetail(c.spec);
      expect(ok, `${c.name} should validate but did not: ${JSON.stringify(validateDetail.errors)}`).toBe(true);
    });
  }
});

describe('detail meta-schema — cases expected to fail for their reason', () => {
  for (const c of cases.filter((x) => x.expect === 'fail')) {
    test(c.name, () => {
      const ok = validateDetail(c.spec);
      expect(ok, `${c.name} must be rejected by the meta-schema`).toBe(false);
      const keywords = (validateDetail.errors ?? []).map((e) => e.keyword);
      expect(keywords, `${c.name}: expected '${c.reason}' among ${JSON.stringify(keywords)}`).toContain(c.reason);
    });
  }
});
