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
 *   (2) one real fan-out smoke — actually spawnSync all four v2 CLIs on a shared
 *       fixture case and assert real four-language agreement (idempotent:true).
 *
 * The envelope shape under test is the gateway's own contract (validate-runner
 * runCli output): { lang, ok, valid, errors:[5-field], ms, loadError }.
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
function env(lang, { valid = false, errors = [], loadError = null } = {}) {
  return { lang, ok: true, valid, errors, ms: 1, loadError };
}

/** A 5-field error record (the canonical normErrors shape). */
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
    // false-mismatch regression lock: normValue collapses 5.0→5 upstream, so a
    // numeric value that serializes as f64 in Rust must NOT split the signature.
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

  test('all four share one loadError code → idempotent:true', () => {
    const results = ['js', 'php', 'go', 'rust'].map((l) =>
      env(l, { loadError: { code: 'REF_FILE_NOT_FOUND', message: 'missing' } })
    );
    expect(compareIdempotency(results).idempotent).toBe(true);
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

  test('a failed CLI (ok:false) is excluded from the verdict, never folded into consensus', () => {
    // Three agree valid:true; the fourth crashed. A crashed engine does NOT vote
    // — it is filtered before signatures are computed, so it cannot turn a real
    // disagreement into false agreement (it is not silently counted as a yes).
    // The verdict reflects only the engines that actually ran.
    const results = [
      env('js', { valid: true }),
      env('php', { valid: true }),
      env('go', { valid: true }),
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'binary missing' },
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(true);
    expect(mismatch).toBeNull();
    // And if the crashed engine WERE compared, its signature is the __error__
    // channel — distinct from any valid=... — so it can never silently agree.
    expect(signature(results[3])).toMatch(/^__error__:/);
    expect(signature(results[0])).not.toBe(signature(results[3]));
  });

  test('a crashed engine masking a real disagreement is still caught (2 runnable disagree)', () => {
    // js/php disagree on validity; go/rust both crashed. The two that ran do NOT
    // agree, so the verdict is false — a crash cannot hide a live divergence.
    const results = [
      env('js', { valid: true }),
      env('php', { valid: false, errors: [err()] }),
      { lang: 'go', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'down' },
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'down' },
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch.groups.length).toBe(2);
  });

  test('fewer than two runnable engines → no judgement (idempotent:null)', () => {
    const results = [
      env('js', { valid: true }),
      { lang: 'php', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'down' },
      { lang: 'go', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'down' },
      { lang: 'rust', ok: false, valid: false, errors: [], ms: 0, loadError: null, error: 'down' },
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBeNull();
    expect(mismatch).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real fan-out smoke (spawns all four v2 CLIs). Requires the Go + Rust binaries
// to be built (npm run build:cli). Slow, so a single representative fixture case
// is selected — selection is logged so the narrowing is explicit, not hidden.
// ---------------------------------------------------------------------------
const allCases = JSON.parse(fs.readFileSync(VALIDATE_FIXTURE, 'utf8'));
const SMOKE_NAME = 'conditional-required-true';
const smoke = allCases.find((c) => c.name === SMOKE_NAME);

describe('validateAll — real 4-language fan-out (representative fixture)', () => {
  test(`[selected: ${SMOKE_NAME} of ${allCases.length} validate cases] four engines agree → idempotent:true`, async () => {
    expect(smoke, `fixture case ${SMOKE_NAME} must exist`).toBeTruthy();
    const out = await validateAll({ spec: smoke.spec, data: smoke.data });
    // Every engine must have run (ok). A missing Go/Rust binary surfaces here.
    const failed = out.results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);
    expect(out.idempotent, JSON.stringify(out.mismatch)).toBe(true);
    // The shared verdict must reproduce the fixture's expected validity.
    expect(out.results[0].valid).toBe(smoke.expected.valid);
  }, 60000);
});
