/**
 * Detail specification structure conformance for the JavaScript reference.
 *
 * It runs the shared fixture tests/fixtures/detail-validity/cases.json, which the meta-schema check
 * and the Go, PHP, PHP extension and Rust validators read as well. Each case declares what the
 * four-language engine does:
 *  - `engine: "pass"` — composition and the forbidden-key scan load cleanly. The meta-schema may
 *    still reject the case (`expect: "fail"`); the engine must not.
 *  - `engine: { code, at }` — the engine rejects the case as a load failure with that code and
 *    dotted composition trace.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDetail } from './index';
import { ComposeLoadError } from '../compose/index';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../tests/fixtures/detail-validity/cases.json'
);

interface DetailValidityCase {
  name: string;
  note: string;
  expect: 'ok' | 'fail';
  reason?: string;
  engine: 'pass' | { code: string; at: string };
  files?: Record<string, Record<string, unknown>>;
  spec: Record<string, unknown>;
}

const cases: DetailValidityCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/** Run one fixture case and record validateDetail evidence for it. */
function proves(name: string, body: () => void): Promise<void> {
  return provesConformance(
    { features: ['validateDetail'], fixture: 'tests/fixtures/detail-validity/cases.json', runtime: 'javascript', case: name },
    body
  );
}

function run(c: DetailValidityCase) {
  return validateDetail(c.spec, c.files ? { files: c.files } : {});
}

describe('detail validate — every case declares an engine expectation', () => {
  test('no case is missing engine', () => {
    for (const c of cases) {
      const declared =
        c.engine === 'pass' ||
        (typeof c.engine === 'object' && typeof c.engine.code === 'string' && typeof c.engine.at === 'string');
      expect(declared, `${c.name} must declare engine: "pass" | {code, at}`).toBe(true);
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});

describe('detail validate — engine:pass loads clean', () => {
  for (const c of cases.filter((x) => x.engine === 'pass')) {
    test(c.name, () =>
      proves(c.name, () => {
        expect(run(c)).toStrictEqual({ valid: true, errors: [] });
      }));
  }
});

describe('detail validate — a composition or forbidden-key failure is a load error', () => {
  for (const c of cases.filter((x) => typeof x.engine === 'object')) {
    test(c.name, () =>
      proves(c.name, () => {
        const want = c.engine as { code: string; at: string };
        let thrown: unknown;
        try {
          run(c);
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(ComposeLoadError);
        const error = thrown as ComposeLoadError;
        expect(error.code).toStrictEqual(want.code);
        expect(error.trace.join('.')).toStrictEqual(want.at);
      }));
  }
});
