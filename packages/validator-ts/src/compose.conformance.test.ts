/**
 * CRUDUI composition-engine conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/compose/cases.json is declared to be the JS
 * reference compose engine's own output (expanded single spec, or load-error
 * code). This test RE-VERIFIES that claim by running the real engine
 * (composeProperties / composeSpec) against the same fixture the other three
 * engines (PHP / Go / Rust) load, with type-strict comparison.
 *
 * It also enforces the core invariant (SPEC §5, §7): an unresolved composition
 * is a LOAD ERROR (ComposeLoadError) — never `valid:true`. Each `err-*` case
 * must throw the exact `expectError.code`; each success case must reproduce
 * `expected` bit-for-bit (composition keys eliminated).
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeProperties,
  composeSpec,
  MemoryLoader,
  ComposeLoadError,
} from './compose/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/CRUDUI -> repo root is four levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/compose/cases.json'
);

interface CaseInput {
  files?: Record<string, Record<string, unknown>>;
  entry: Record<string, unknown>;
  kind?: 'properties' | 'spec';
  basepath?: string;
}
interface FixtureCase {
  name: string;
  note: string;
  input: CaseInput;
  expected?: unknown;
  expectError?: { code: string };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// Stable key ordering so object comparison is order-insensitive (the other
// harnesses canonicalize the same way). Arrays keep their order.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canon((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function run(c: FixtureCase): Record<string, unknown> {
  const loader = new MemoryLoader(c.input.files ?? {});
  const opts = c.input.basepath ? { basepath: c.input.basepath } : {};
  return (c.input.kind ?? 'properties') === 'spec'
    ? composeSpec(c.input.entry, loader, opts)
    : composeProperties(c.input.entry, loader, opts);
}

describe('compose — success cases reproduce the expanded single spec', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, () => {
      const result = run(c);
      expect(canon(result)).toStrictEqual(canon(c.expected));
      // Composition keys must be eliminated (single-spec equivalence, SPEC §5).
      const json = JSON.stringify(result);
      expect(json).not.toContain('"$ref"');
      expect(json).not.toContain('"$patch"');
    });
  }
});

describe('compose — unresolved composition is a LOAD ERROR, never valid:true', () => {
  for (const c of cases.filter((x) => x.expectError)) {
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
        c.expectError!.code
      );
    });
  }
});

describe('compose — composition is pure pre-processing (field-layer invariant)', () => {
  // The analysis "합성 후 필드층 불변": a composed single spec must be bit-identical
  // to the same content written WITHOUT composition. Prove it on every success
  // case by re-composing the already-expanded spec (no $ref/$patch left) and
  // checking it is a fixed point.
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-compose is a fixed point`, () => {
      const first = run(c);
      const loader = new MemoryLoader({});
      const again = composeProperties(
        first as Record<string, unknown>,
        loader
      );
      expect(canon(again)).toStrictEqual(canon(first));
    });
  }
});
