/**
 * CRUDUI list-spec validation conformance — JS reference verification (SPEC §9).
 *
 * The read sister of validate.conformance.test.ts. It pins the four-language
 * structure check for a list-spec: compose ($ref/$patch on the columns map and a
 * `{ $ref, $patch }` search overlay) + forbidden-scan over the whole composed
 * list tree. It does NOT validate rows — a list has no data (rows are injected,
 * SPEC §9).
 *
 * It runs the SHARED fixture tests/fixtures/list-validity/cases.json — the
 * same file the Ajv meta-schema check reads. The fixture identifies which
 * checker owns each requirement:
 *  - `engine: "pass"`                       — the four-language engine has NO
 *    opinion (a "schema shape" check: required/enum/additionalProperties/anyOf).
 *    The meta-schema may still REJECT it; the engine must NOT throw.
 *  - `engine: { code, at }`                 — the engine REJECTS it as a LOAD
 *    failure (a forbidden meta key surfaced by compose+forbidden-scan). The
 *    thrown `ComposeLoadError.code` and dotted `trace` are asserted — the depth is
 *    load-bearing.
 *
 * This proves the design claim: list 4-language validation = form passes 1+2
 * (compose + forbidden-scan) reused, DATA pass excluded. The "schema shape" half
 * stays with the meta-schema (no new invention).
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS engine output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateList, ComposeLoadError } from './index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/validate-list -> repo root is five levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../../tests/fixtures/list-validity/cases.json'
);

interface ListValidityCase {
  name: string;
  note: string;
  expect: 'ok' | 'fail';
  reason?: string;
  /** What the four-language engine (compose + forbidden-scan) does. */
  engine: 'pass' | { code: string; at: string };
  files?: Record<string, Record<string, unknown>>;
  spec: Record<string, unknown>;
}

const cases: ListValidityCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function run(c: ListValidityCase) {
  return validateList(c.spec, c.files ? { files: c.files } : {});
}

describe('list validate — every case declares an engine expectation', () => {
  test('no case is silently missing `engine`', () => {
    for (const c of cases) {
      const ok =
        c.engine === 'pass' ||
        (typeof c.engine === 'object' &&
          typeof c.engine.code === 'string' &&
          typeof c.engine.at === 'string');
      expect(ok, `${c.name} must declare engine: "pass" | {code, at}`).toBe(true);
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});

describe('list validate — engine:pass loads clean (no rows validated)', () => {
  for (const c of cases.filter((x) => x.engine === 'pass')) {
    test(c.name, () => {
      // The structure check does not reject a meta-schema-only invalid case
      // (required/enum/additionalProperties/anyOf) is the meta-schema's job,
      // never this engine's — so it loads clean here.
      let result: ReturnType<typeof validateList> | undefined;
      expect(() => {
        result = run(c);
      }, `${c.name} must not be rejected by the four-language structure check`).not.toThrow();
      // No rows → no data validation: a clean load is always { valid:true, errors:[] }.
      expect(result).toStrictEqual({ valid: true, errors: [] });
    });
  }
});

describe('list validate — a forbidden meta key in the list tree is a LOAD ERROR', () => {
  for (const c of cases.filter((x) => typeof x.engine === 'object')) {
    test(c.name, () => {
      const want = c.engine as { code: string; at: string };
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
      expect(err.code).toStrictEqual(want.code);
      // The dotted trace points at the shallowest offending key — depth is
      // load-bearing (a deeply nested meta key must be caught at its real path).
      expect(err.trace.join('.')).toStrictEqual(want.at);
    });
  }
});

describe('list validate — does NOT touch form-spec validate (R7 parallel)', () => {
  test('validateList takes no `data` argument and validates no rows', () => {
    // A list-spec carrying a "data-shaped" key alongside columns is irrelevant:
    // the function signature has no data slot and the result never reflects rows.
    const result = validateList({
      columns: { name: { field: 'name' } },
    });
    expect(result).toStrictEqual({ valid: true, errors: [] });
    // Two args max (spec, options) — there is no third data argument.
    expect(validateList.length).toBeLessThanOrEqual(2);
  });
});
