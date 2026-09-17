/**
 * CRUDUI recursive forbidden-scan conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/spec-validity/cases.json is the cross-
 * language contract for SPEC §6 global meta-key rejection: a clean spec
 * passes; a forbidden meta key found at ANY depth (slot/bucket body and one
 * level below, deep child subtrees, array elements, $ref-inherited bases) is a
 * LOAD ERROR, never `valid:true`. This test RE-VERIFIES the claim by running the
 * real load path (`validate` = compose → forbidden-scan → validate) against
 * the same fixture PHP / Go / Rust load.
 *
 * Each `engine: "pass"` case must return `{ valid: true, errors: [] }`. Each
 * `engine: { code, at }` case must throw a `ComposeLoadError` whose `code` is
 * `code` AND whose path (`trace`, dotted) equals `at` — the depth is
 * load-bearing, so the path is asserted, not just the code. The case `files` are
 * the composition files passed to the runtime. The meta-schema members `expect`
 * and `reason` are checked by form-metaschema.conformance.test.ts.
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, ComposeLoadError } from './validate/index';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/CRUDUI -> repo root is four levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/spec-validity/cases.json'
);

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  expect: 'ok' | 'fail';
  reason?: string;
  engine: 'pass' | { code: string; at: string };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/** Run one fixture case and record validate evidence for it. */
function proves(name: string, body: () => void): Promise<void> {
  return provesConformance(
    { features: ['validate'], fixture: 'tests/fixtures/spec-validity/cases.json', runtime: 'javascript', case: name },
    body
  );
}

function run(c: FixtureCase) {
  // Data is irrelevant to the scan; pass an empty object. The scan runs in the
  // load path before any data-driven validation.
  return validate(c.spec, {}, c.files ? { files: c.files } : {});
}

describe('forbidden-scan — clean specs pass the load path', () => {
  for (const c of cases.filter((x) => x.engine === 'pass')) {
    test(c.name, () =>
      proves(c.name, () => {
        expect(run(c)).toStrictEqual({ valid: true, errors: [] });
      }));
  }
});

describe('forbidden-scan — a forbidden meta key at any depth is a LOAD ERROR', () => {
  for (const c of cases.filter((x) => typeof x.engine === 'object')) {
    test(c.name, () =>
      proves(c.name, () => {
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
        expect(err.trace.join('.')).toStrictEqual(want.at);
      }));
  }
});

describe('forbidden-scan — every fixture case declares an expectation', () => {
  test('no case is silently missing an engine field', () => {
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
