/**
 * CRUDUI validator conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/validate/cases.json is declared to be the JS
 * reference CRUDUI validator's own output (`{ valid, errors }`, or a failure
 * record). This test RE-VERIFIES that claim by running the real engine
 * (`validate` = compose → traverse → validate-slot evaluation) against the
 * same fixture the PHP, C extension, Go and Rust engines load, with type-strict
 * comparison.
 *
 * A failure produces no validation result. An unresolved composition throws a
 * `ComposeLoadError`; submitted data with the wrong shape throws a
 * `FormInputError`. Each `expectFailure` case must throw the exact
 * `{ code, message, at }` record; each result case must reproduce `expected`.
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, ComposeLoadError, FormInputError } from './validate/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/CRUDUI -> repo root is four levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/validate/cases.json'
);

interface FailureRecord {
  code: string;
  message: string;
  at: string;
}

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  data: unknown;
  expected?: { valid: boolean; errors: unknown[] };
  expectFailure?: FailureRecord;
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function run(c: FixtureCase) {
  return validate(c.spec, c.data, c.files ? { files: c.files } : {});
}

/** The cross-language failure record of a thrown validation failure. */
function failureRecord(error: unknown): FailureRecord | undefined {
  if (error instanceof ComposeLoadError) {
    return { code: error.code, message: error.message, at: error.trace.join('.') };
  }
  if (error instanceof FormInputError) {
    return { code: error.code, message: error.message, at: '' };
  }
  return undefined;
}

describe('validate — result cases reproduce { valid, errors } bit-for-bit', () => {
  for (const c of cases.filter((x) => x.expected)) {
    test(c.name, () => {
      const result = run(c);
      expect(result).toStrictEqual(c.expected);
    });
  }
});

describe('validate — load and input failures throw the exact failure record', () => {
  for (const c of cases.filter((x) => x.expectFailure)) {
    test(c.name, () => {
      let thrown: unknown;
      try {
        run(c);
      } catch (e) {
        thrown = e;
      }
      expect(failureRecord(thrown), `${c.name} must throw a validation failure`).toStrictEqual(
        c.expectFailure
      );
    });
  }
});

describe('validate — every fixture case is exercised', () => {
  test('each case declares exactly one expectation', () => {
    for (const c of cases) {
      expect(
        (c.expected !== undefined) !== (c.expectFailure !== undefined),
        `${c.name} must declare exactly one of expected or expectFailure`
      ).toBe(true);
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});
