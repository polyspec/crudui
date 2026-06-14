/**
 * v2 recursive forbidden-scan conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/spec-validity/cases.json is the cross-
 * language contract for SPEC-V2 §6 global meta-key rejection: a clean spec
 * passes; a forbidden meta key found at ANY depth (slot/bucket body and one
 * level below, deep child subtrees, array elements, $ref-inherited bases) is a
 * LOAD ERROR, never `valid:true`. This test RE-VERIFIES the claim by running the
 * real load path (`validateV2` = compose → forbidden-scan → validate) against
 * the same fixture PHP / Go / Rust load.
 *
 * Each `ok` case must validate without throwing. Each error case must throw a
 * `ComposeLoadError` whose `code` is the fixture `error_code` AND whose path
 * (`trace`, dotted) equals the fixture `at_path` — the depth is load-bearing, so
 * the path is asserted, not just the code.
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateV2, ComposeLoadError } from './validate/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/v2 -> repo root is four levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../../tests/fixtures/spec-validity/cases.json'
);

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  expect: 'ok' | { error_code: string; at_path: string };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function run(c: FixtureCase) {
  // Data is irrelevant to the scan; pass an empty object. The scan runs in the
  // load path before any data-driven validation.
  return validateV2(c.spec, {}, c.files ? { files: c.files } : {});
}

describe('v2 forbidden-scan — clean specs pass the load path', () => {
  for (const c of cases.filter((x) => x.expect === 'ok')) {
    test(c.name, () => {
      expect(() => run(c)).not.toThrow();
    });
  }
});

describe('v2 forbidden-scan — a forbidden meta key at any depth is a LOAD ERROR', () => {
  for (const c of cases.filter((x) => x.expect !== 'ok')) {
    test(c.name, () => {
      const want = c.expect as { error_code: string; at_path: string };
      let thrown: unknown;
      try {
        run(c);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(
        ComposeLoadError
      );
      const err = thrown as ComposeLoadError;
      expect(err.code).toStrictEqual(want.error_code);
      expect(err.trace.join('.')).toStrictEqual(want.at_path);
    });
  }
});

describe('v2 forbidden-scan — every fixture case declares an expectation', () => {
  test('no case is silently missing an expect field', () => {
    for (const c of cases) {
      const ok =
        c.expect === 'ok' ||
        (typeof c.expect === 'object' &&
          typeof c.expect.error_code === 'string' &&
          typeof c.expect.at_path === 'string');
      expect(ok, `${c.name} must declare expect: "ok" | {error_code, at_path}`).toBe(
        true
      );
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});
