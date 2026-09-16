/**
 * Gateway VALIDATE verdict — conformance over the idempotency comparator.
 *
 * compareIdempotency(results) is the single point that turns four per-language
 * envelopes into the cross-check verdict { idempotent, mismatch }. This is the
 * exact function the live gateway calls; here it is exercised in isolation so a
 * regression in the verdict logic is caught without spawning four CLIs.
 *
 * Two layers:
 *   (1) pure-comparator units — agreement → idempotent:true; a tampered
 *       (fake-divergent) language → idempotent:false with that language isolated
 *       in mismatch.groups; the f64-vs-int collapse stays true (false-mismatch
 *       regression lock); a failed CLI never silently agrees; <2 runnable → null.
 *   (2) one real fan-out smoke — actually spawnSync all four CRUDUI CLIs on a shared
 *       fixture case and assert real four-language agreement (idempotent:true).
 *
 * The envelope shape under test is the gateway's own contract (validate-runner
 * runCli output): { lang, ok, valid, errors:[5-field], ms, failure }.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareIdempotency, signature, validateAll } from './validate-runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const VALIDATE_FIXTURE = path.resolve(ROOT, 'tests/fixtures/validate/cases.json');

/** A clean ok=true envelope. errors default to []. */
function env(lang, { valid = false, errors = [], failure = null } = {}) {
  return { lang, ok: true, valid, errors, ms: 1, failure };
}

/** A complete validation error record. */
function err({ path = 'email', field = 'email', rule = 'required', message = 'This field is required.', value = '' } = {}) {
  return { path, field, rule, message, value };
}

describe('compareIdempotency — agreement', () => {
  test('four identical valid:true envelopes → idempotent:true, no mismatch', () => {
    const results = ['js', 'php', 'go', 'rust'].map((l) => env(l, { valid: true }));
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(true);
    expect(mismatch).toBeNull();
  });

  test('four identical valid:false + same error[] → idempotent:true', () => {
    const results = ['js', 'php', 'go', 'rust'].map((l) =>
      env(l, { valid: false, errors: [err()] })
    );
    const { idempotent } = compareIdempotency(results);
    expect(idempotent).toBe(true);
  });

  test('f64-vs-int value (rust 5.0 vs js/php/go 5) collapses → still idempotent:true', () => {
    // JSON parsing represents 5 and 5.0 as the same JavaScript number.
    const numErr = (v) => err({ rule: 'min', message: 'too small', value: v });
    const results = [
      env('js', { errors: [numErr(5)] }),
      env('php', { errors: [numErr(5)] }),
      env('go', { errors: [numErr(5)] }),
      env('rust', { errors: [numErr(5.0)] }),
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(true);
    expect(mismatch).toBeNull();
  });

  test('all four share one failure record → idempotent:true', () => {
    const results = ['js', 'php', 'go', 'rust'].map((l) =>
      env(l, { failure: { code: 'REF_FILE_NOT_FOUND', message: 'missing', at: 'Missing.yml' } })
    );
    expect(compareIdempotency(results).idempotent).toBe(true);
  });

  test('object member order in an error value does not create a false mismatch', () => {
    const value = { __0000000000002__: 'same', __0000000000001__: 'same' };
    const reordered = { __0000000000001__: 'same', __0000000000002__: 'same' };
    const results = [
      env('js', { errors: [err({ field: 'tags', path: 'tags', rule: 'unique', value })] }),
      env('php', { errors: [err({ field: 'tags', path: 'tags', rule: 'unique', value })] }),
      env('go', { errors: [err({ field: 'tags', path: 'tags', rule: 'unique', value: reordered })] }),
      env('rust', { errors: [err({ field: 'tags', path: 'tags', rule: 'unique', value })] }),
    ];
    expect(compareIdempotency(results)).toEqual({ idempotent: true, mismatch: null });
  });
});

describe('compareIdempotency — TAMPER (fake-divergent injection)', () => {
  test('go tampered to valid:true while js/php/rust are valid:false → idempotent:false, go isolated', () => {
    // Three engines agree the data is invalid; one fake-Go result is forged to
    // valid:true. The verdict must break AND name go as the lone divergent group.
    const results = [
      env('js', { valid: false, errors: [err()] }),
      env('php', { valid: false, errors: [err()] }),
      env('go', { valid: true, errors: [] }), // <-- TAMPERED
      env('rust', { valid: false, errors: [err()] }),
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch).not.toBeNull();
    // The tampered go must be alone in its own signature group.
    const goGroup = mismatch.groups.find((g) => g.langs.includes('go'));
    expect(goGroup.langs).toEqual(['go']);
    // The other three must share a single group.
    const others = mismatch.groups.find((g) => g.langs.includes('js'));
    expect(others.langs.sort()).toEqual(['js', 'php', 'rust']);
  });

  test('one language with the same failure code but a different message → idempotent:false, that language isolated', () => {
    const record = { code: 'INVALID_FORM_INPUT', message: 'Repeated data must be a keyed object: items', at: '' };
    const results = [
      env('js', { failure: record }),
      env('php', { failure: record }),
      env('go', { failure: { ...record, message: 'Repeated data must be a keyed object: other' } }), // <-- TAMPERED
      env('rust', { failure: record }),
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch.groups.find((g) => g.langs.includes('go')).langs).toEqual(['go']);
  });

  test('one language with a tampered errors[] (extra error) → idempotent:false, that language isolated', () => {
    const base = () => env('x', { valid: false, errors: [err()] });
    const results = [
      { ...base(), lang: 'js' },
      { ...base(), lang: 'php' },
      { ...base(), lang: 'go' },
      // rust forged with an extra error record nobody else produced.
      env('rust', { valid: false, errors: [err(), err({ field: 'phantom', rule: 'pattern' })] }),
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    const rustGroup = mismatch.groups.find((g) => g.langs.includes('rust'));
    expect(rustGroup.langs).toEqual(['rust']);
  });

  test('a failed CLI makes the four-language comparison fail', () => {
    const results = [
      env('js', { valid: true }), env('php', { valid: true }), env('go', { valid: true }),
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'binary missing' },
    ];
    expect(compareIdempotency(results).idempotent).toBe(false);
    expect(compareIdempotency(results.slice(0, 3)).mismatch.missing).toEqual(['rust']);
    expect(compareIdempotency([]).idempotent).toBe(false);
    expect(compareIdempotency([...results.slice(0, 3), results[0]]).idempotent).toBe(false);
  });

  test('a crashed engine masking a real disagreement is still caught (2 runnable disagree)', () => {
    // js/php disagree on validity; go/rust both crashed. The two that ran do NOT
    // agree, so the verdict is false — a crash cannot hide a live divergence.
    const results = [
      env('js', { valid: true }),
      env('php', { valid: false, errors: [err()] }),
      { lang: 'go', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'down' },
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'down' },
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch.groups.length).toBe(3);
  });

  test('fewer than two runnable engines fail the comparison', () => {
    const results = [
      env('js', { valid: true }),
      { lang: 'php', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'down' },
      { lang: 'go', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'down' },
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, failure: null, error: 'down' },
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real fan-out (spawns all four CRUDUI CLIs for every shared form fixture).
// Requires the Go + Rust binaries to be built (npm run build:cli).
// ---------------------------------------------------------------------------
const allCases = JSON.parse(fs.readFileSync(VALIDATE_FIXTURE, 'utf8'));
describe('validateAll — real 4-language fan-out (every fixture case)', () => {
  for (const c of allCases) {
    test(`${c.name} — four engines agree → idempotent:true`, async () => {
      const out = await validateAll({ spec: c.spec, data: c.data, files: c.files ?? {}, basepath: c.basepath ?? '' });
      expect(out.results.map((r) => r.lang)).toEqual(['js', 'php', 'go', 'rust']);
      expect(out.results.filter((r) => !r.ok).map((r) => `${r.lang}:${r.error}`)).toEqual([]);
      expect(out.idempotent, JSON.stringify(out.mismatch)).toBe(true);
      if (c.expectFailure) {
        expect(out.results.every((r) => r.failure
          && r.failure.code === c.expectFailure.code
          && r.failure.message === c.expectFailure.message
          && r.failure.at === c.expectFailure.at)).toBe(true);
      } else {
        expect(out.results[0].valid).toBe(c.expected.valid);
      }
    }, 60000);
  }
});
