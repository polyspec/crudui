/**
 * CRUDUI validator conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/validate/cases.json is declared to be the JS
 * reference CRUDUI validator's own output (`{ valid, errors }`, or a load-error
 * code). This test RE-VERIFIES that claim by running the real engine
 * (`validate` = compose → traverse → validate-slot evaluation) against the
 * same fixture the other three engines (PHP / Go / Rust) load, with type-strict
 * comparison.
 *
 * It also enforces the core invariant (SPEC §5, §7): an unresolved
 * composition is a LOAD ERROR (`ComposeLoadError`) — never `valid:true`. Each
 * `expectLoadError` case must throw the exact code; each result case must
 * reproduce `expected` bit-for-bit (same valid + errors[], SPEC G-B).
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, ComposeLoadError } from './validate/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/CRUDUI -> repo root is four levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/validate/cases.json'
);

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  data: Record<string, unknown>;
  expected?: { valid: boolean; errors: unknown[] };
  expectLoadError?: { code: string };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function run(c: FixtureCase) {
  return validate(c.spec, c.data, c.files ? { files: c.files } : {});
}

describe('current validate — result cases reproduce { valid, errors } bit-for-bit', () => {
  for (const c of cases.filter((x) => x.expected)) {
    test(c.name, () => {
      const result = run(c);
      expect(result).toStrictEqual(c.expected);
    });
  }
});

describe('current validate — unresolved composition is a LOAD ERROR, never valid:true', () => {
  for (const c of cases.filter((x) => x.expectLoadError)) {
    test(c.name, () => {
      let thrown: unknown;
      try {
        run(c);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(
        ComposeLoadError
      );
      expect((thrown as ComposeLoadError).code).toStrictEqual(
        c.expectLoadError!.code
      );
    });
  }
});

describe('current validate — every fixture case is exercised', () => {
  test('no case is silently missing an expectation', () => {
    for (const c of cases) {
      expect(
        c.expected !== undefined || c.expectLoadError !== undefined,
        `${c.name} must declare expected or expectLoadError`
      ).toBe(true);
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});
