/**
 * v1→v2 translator conformance — JS reference verification (SPEC §6).
 *
 * The shared fixture tests/fixtures/translate/cases.json is the cross-language
 * contract for the legacy→canonical migration: each case carries the v1 input,
 * the translator's v2 output, the irreversibility note log, and the round-trip
 * verdict. This test RE-RUNS the real translator and asserts:
 *
 *   1. Forward translation reproduces the fixture `v2` bit-for-bit (deepEqual).
 *   2. The note log reproduces the fixture `notes` (reason + path + key).
 *   3. Every translated `v2` passes the v2 META-SCHEMA (ajv) — the translator
 *      emits a spec the v2 constitution accepts, never a weakened shape.
 *   4. Every translated `v2` passes the recursive FORBIDDEN-SCAN — ZERO meta
 *      keys at any depth (no display_switch/if/when/_/$after/x{key} survives).
 *   5. The ROUND-TRIP gate: a `reversible:true` case satisfies v1→v2→v1 =
 *      original bit-for-bit. A `reversible:false` (R7 transcend) case is OUTSIDE
 *      the gate — losslessness is NOT asserted; the recorded reason is.
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is NOT
 * the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';
import {
  translateV1ToV2,
  translateV2ToV1,
  deepEqual,
  type TranslateNote,
} from './index';
import { scanForbiddenKeys } from '../forbidden-scan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/v2/translate -> repo root is five levels up.
const ROOT = path.resolve(__dirname, '../../../../..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/translate/cases.json');
const SCHEMA = path.join(ROOT, 'schema/form-spec-v2.schema.json');

interface FixtureCase {
  name: string;
  note: string;
  v1: Record<string, unknown>;
  v2: Record<string, unknown>;
  notes: TranslateNote[];
  roundtrip: { reversible: boolean; lossless?: boolean; back?: Record<string, unknown> };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// Compile the v2 meta-schema once (Field is the root: $ref → #/definitions/Field).
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema: ValidateFunction = ajv.compile(schema);

describe('v1→v2 translator — forward output matches the fixture', () => {
  for (const c of cases) {
    test(`${c.name}: v2 reproduced bit-for-bit`, () => {
      const { v2, notes } = translateV1ToV2(c.v1);
      expect(deepEqual(v2, c.v2), `v2 mismatch for ${c.name}`).toBe(true);
      expect(notes, `note log mismatch for ${c.name}`).toStrictEqual(c.notes);
    });
  }
});

describe('v1→v2 translator — output passes the v2 meta-schema', () => {
  for (const c of cases) {
    test(`${c.name}: meta-schema valid`, () => {
      const ok = validateSchema(c.v2);
      expect(ok, `meta-schema errors: ${JSON.stringify(validateSchema.errors)}`).toBe(true);
    });
  }
});

describe('v1→v2 translator — output has ZERO forbidden meta keys', () => {
  for (const c of cases) {
    test(`${c.name}: forbidden-scan clean`, () => {
      expect(() => scanForbiddenKeys(c.v2, [c.name])).not.toThrow();
    });
  }
  test('no x{key} survives in any canonical output', () => {
    const json = JSON.stringify(cases.map((c) => c.v2));
    // No object KEY may be an x-comment. Walk every case spec for x-prefixed keys.
    const hasXKey = (n: unknown): boolean => {
      if (Array.isArray(n)) return n.some(hasXKey);
      if (n === null || typeof n !== 'object') return false;
      for (const k of Object.keys(n as Record<string, unknown>)) {
        if (k.length > 1 && k.charCodeAt(0) === 0x78) return true;
        if (hasXKey((n as Record<string, unknown>)[k])) return true;
      }
      return false;
    };
    expect(hasXKey(cases.map((c) => c.v2))).toBe(false);
    expect(json.length).toBeGreaterThan(0);
  });
});

describe('v1→v2→v1 round-trip gate (SPEC §6): reversible set is lossless', () => {
  const reversibleCases = cases.filter((c) => c.roundtrip.reversible);
  for (const c of reversibleCases) {
    test(`${c.name}: v1→v2→v1 = original bit-for-bit`, () => {
      // The forward pass must log NOTHING for a reversible case (the gate).
      const { v2, notes } = translateV1ToV2(c.v1);
      expect(notes, `${c.name} must be in the reversible set (empty note log)`).toStrictEqual([]);
      const back = translateV2ToV1(v2);
      expect(deepEqual(back, c.v1), `${c.name} round-trip lost data`).toBe(true);
      // The fixture also recorded the reverse output — assert it matches.
      expect(deepEqual(back, c.roundtrip.back ?? c.v1)).toBe(true);
    });
  }
  test(`the reversible set is non-empty (gate has teeth)`, () => {
    expect(reversibleCases.length).toBeGreaterThan(0);
  });
});

describe('R7 transcend set: irreversible cases are OUTSIDE the gate, with a reason', () => {
  const irreversibleCases = cases.filter((c) => !c.roundtrip.reversible);
  for (const c of irreversibleCases) {
    test(`${c.name}: at least one absorption note, no losslessness claim`, () => {
      const { notes } = translateV1ToV2(c.v1);
      expect(notes.length, `${c.name} must record ≥1 irreversibility note`).toBeGreaterThan(0);
      // Every note carries an R7 reason and a path.
      for (const n of notes) {
        expect(typeof n.reason).toBe('string');
        expect(typeof n.path).toBe('string');
        expect(typeof n.v1Key).toBe('string');
      }
      // The fixture must NOT claim losslessness for a transcend case.
      expect(c.roundtrip.lossless).toBeUndefined();
    });
  }
  test(`the transcend set is non-empty (R7 absorptions are exercised)`, () => {
    expect(irreversibleCases.length).toBeGreaterThan(0);
  });
});

describe('meta-schema NEGATIVE regression: forbidden meta keys are rejected (valid:false)', () => {
  // Each spec is a valid v2 Field with ONE forbidden meta key injected. The Ajv
  // meta-schema must reject every one — proving the canonical model does NOT
  // recognize condition-only meta keys / legacy patch directives / x{key} (R2/R4).
  // This is the static twin of the runtime forbidden-scan: if any of these passes
  // Ajv, the constitution leaked a meta key and the negative gate has no teeth.
  const pollutedSpecs: { name: string; spec: Record<string, unknown> }[] = [
    {
      name: 'display_switch at field top level',
      spec: { type: 'text', display_switch: { 1: ['x'] } },
    },
    {
      name: 'display_target at field top level',
      spec: { type: 'text', display_target: '.a' },
    },
    {
      name: '$after composition directive (must be $patch)',
      spec: { type: 'text', $after: { foo: { type: 'text' } } },
    },
    {
      name: '$before composition directive',
      spec: { type: 'text', $before: { foo: { type: 'text' } } },
    },
    {
      name: '$merge composition directive',
      spec: { type: 'text', $merge: { foo: 1 } },
    },
    {
      name: '$remove composition directive',
      spec: { type: 'group', properties: { $remove: ['old'] } },
    },
    {
      name: 'if condition-only meta key under options bucket',
      spec: { type: 'text', options: { if: '.a==1' } },
    },
    {
      name: 'when condition-only meta key under options bucket',
      spec: { type: 'text', options: { when: '.a' } },
    },
    {
      name: 'show_if condition-only meta key under options bucket',
      spec: { type: 'text', options: { show_if: true } },
    },
    {
      name: 'x{key} comment residue (xclass) at field top level',
      spec: { type: 'text', xclass: 'old' },
    },
    {
      name: 'x{key} comment residue (xnote) under properties map',
      spec: { type: 'group', properties: { xnote: { type: 'text' } } },
    },
    {
      name: 'seqtokey legacy magic encoding under options',
      spec: { type: 'text', options: { seqtokey: 1 } },
    },
    {
      name: 'magic-symbol meta key "_" under validate slot',
      spec: { type: 'text', validate: { _: true } },
    },
  ];

  for (const { name, spec } of pollutedSpecs) {
    test(`${name}: Ajv rejects (valid:false)`, () => {
      const ok = validateSchema(spec);
      expect(
        ok,
        `meta-schema accepted a forbidden meta key — leak: ${JSON.stringify(spec)}`
      ).toBe(false);
    });
  }

  test('control: the un-polluted base spec IS accepted (gate is not a blanket reject)', () => {
    expect(validateSchema({ type: 'text', options: { rows: 3 } })).toBe(true);
  });
});

describe('v1→v2 translator — every fixture case declares a verdict', () => {
  test('no case is silently missing its roundtrip verdict', () => {
    for (const c of cases) {
      expect(typeof c.roundtrip.reversible, `${c.name} missing roundtrip.reversible`).toBe(
        'boolean'
      );
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});
