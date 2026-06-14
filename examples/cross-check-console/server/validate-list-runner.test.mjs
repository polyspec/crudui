/**
 * Gateway VALIDATE-LIST verdict — the read sister of validate-runner.test.mjs.
 *
 * `validateAllList(req)` is the exact function the live gateway's POST
 * /api/validate-list calls: it fans one list-spec STRUCTURE across the four v2
 * CLIs in `mode:list` (compose → forbidden-scan, SPEC §9 — no DATA pass, a list
 * carries no rows), then reduces the four per-language envelopes to the verdict
 * via the SAME compareIdempotency the form path uses. A clean load is
 * { valid:true, errors:[] }; a forbidden meta key / unresolved $ref surfaces as
 * the SAME loadError envelope as the form path, so the four agree on a LOAD
 * failure as much as on a clean structure.
 *
 * Two layers:
 *   (1) verdict reuse — validateAllList reduces through compareIdempotency, the
 *       exact comparator the form runner's unit suite already locks. No re-test
 *       of the comparator here (it is shared); the focus is the real list fan-out.
 *   (2) real 4-language list fan-out over representative v2-list-validity fixture
 *       cases — the SAME cases.json the JS list conformance suite loads. An
 *       engine:"pass" case must agree on valid:true (idempotent); an
 *       engine:{code} case must agree on the SAME loadError code (idempotent on
 *       a LOAD failure, never a silent valid:true).
 *
 * The envelope shape under test is the gateway's own contract (validate-runner
 * runCli output): { lang, ok, valid, errors:[5-field], ms, loadError }.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareIdempotency, signature, validateAllList } from './validate-runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const LIST_VALIDITY_FIXTURE = path.resolve(ROOT, 'tests/fixtures/v2-list-validity/cases.json');

const allCases = JSON.parse(fs.readFileSync(LIST_VALIDITY_FIXTURE, 'utf8'));

// The four-language engine has no shape opinion (no enum/required/closure): only
// compose + forbidden-scan. So the engine verdict is keyed off `engine`, NOT
// `expect`: engine:"pass" → clean load (valid:true); engine:{code,at} → a LOAD
// failure carrying that code. A `clean` case is any engine:"pass" case (these
// include several RED meta-schema cases that the engine intentionally passes).
const cleanCases = allCases.filter((c) => c.engine === 'pass');
const loadFailCases = allCases.filter((c) => c.engine && typeof c.engine === 'object' && c.engine.code);

describe('validateAllList — real 4-language list fan-out (clean structure → idempotent valid:true)', () => {
  for (const c of cleanCases) {
    test(`${c.name} — four engines agree on a clean load (idempotent, valid:true)`, async () => {
      const out = await validateAllList({ spec: c.spec, files: c.files ?? {}, basepath: '' });

      // Every engine must have run (ok). A missing Go/Rust binary surfaces here.
      const failed = out.results.filter((r) => !r.ok);
      expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);

      // A clean list structure: no loadError, valid:true on every engine.
      expect(out.results.every((r) => r.loadError === null)).toBe(true);
      expect(out.results.every((r) => r.valid === true)).toBe(true);
      expect(out.results.every((r) => r.errors.length === 0)).toBe(true);

      // The four collapse to one verdict.
      expect(out.idempotent, JSON.stringify(out.mismatch)).toBe(true);
    }, 60000);
  }
});

describe('validateAllList — real 4-language list fan-out (forbidden meta key → idempotent LOAD failure)', () => {
  for (const c of loadFailCases) {
    test(`${c.name} — four engines agree on the SAME loadError code ${c.engine.code} (idempotent, never a silent valid:true)`, async () => {
      const out = await validateAllList({ spec: c.spec, files: c.files ?? {}, basepath: '' });

      // Every engine must have run; a LOAD failure is a result, not a crash.
      const failed = out.results.filter((r) => !r.ok);
      expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);

      // Every engine must carry the SAME loadError code — and NEVER valid:true.
      expect(out.results.every((r) => r.loadError && r.loadError.code === c.engine.code)).toBe(true);
      expect(out.results.every((r) => r.valid === false)).toBe(true);

      // Agreement on a LOAD failure is idempotent (the load-code signature path).
      expect(out.idempotent, JSON.stringify(out.mismatch)).toBe(true);
    }, 60000);
  }
});

/**
 * A list per-language envelope (the SAME shape validateAllList's runCli emits): a
 * clean list load is { valid:true, errors:[], loadError:null }; a forbidden meta
 * key surfaces as { valid:false, loadError:{code} }. The list verdict reduces
 * through the SAME compareIdempotency the form path uses, so a forged single
 * language must break the verdict on the list surface too.
 */
function listEnv(lang, { valid = true, loadError = null } = {}) {
  return { lang, ok: true, valid, errors: [], ms: 1, loadError };
}

describe('validateAllList — TAMPER (forged single-language list verdict → idempotent:false)', () => {
  test('three engines clean-load a list while one is forged to a loadError → idempotent:false, forged lang isolated', () => {
    // js/php/go agree the list loads clean (valid:true); a fake-Rust result is
    // forged to a FORBIDDEN_META_KEY load failure. The verdict must break AND
    // name rust as the lone divergent group — a tampered list engine cannot pass
    // the cross-check.
    const results = [
      listEnv('js', { valid: true }),
      listEnv('php', { valid: true }),
      listEnv('go', { valid: true }),
      listEnv('rust', { valid: false, loadError: { code: 'FORBIDDEN_META_KEY', message: 'forged' } }), // <-- TAMPERED
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    expect(mismatch).not.toBeNull();
    const rustGroup = mismatch.groups.find((g) => g.langs.includes('rust'));
    expect(rustGroup.langs).toEqual(['rust']);
    const others = mismatch.groups.find((g) => g.langs.includes('js'));
    expect(others.langs.sort()).toEqual(['go', 'js', 'php']);
  });

  test('three engines reject a forbidden-key list while one is forged to valid:true → idempotent:false, forged lang isolated', () => {
    // js/php/rust agree the list carries a forbidden meta key (the SAME loadError
    // code); a fake-PHP result is forged to a clean valid:true (the v1 silent-pass
    // gap this gate exists to close). The verdict must break with php isolated.
    const code = 'FORBIDDEN_META_KEY';
    const results = [
      listEnv('js', { valid: false, loadError: { code, message: 'if' } }),
      listEnv('php', { valid: true }), // <-- TAMPERED: a forbidden key MUST NOT load clean
      listEnv('go', { valid: false, loadError: { code, message: 'if' } }),
      listEnv('rust', { valid: false, loadError: { code, message: 'if' } }),
    ];
    const { idempotent, mismatch } = compareIdempotency(results);
    expect(idempotent).toBe(false);
    const phpGroup = mismatch.groups.find((g) => g.langs.includes('php'));
    expect(phpGroup.langs).toEqual(['php']);
    // The forged clean verdict carries a distinct signature from the load-code
    // signature the other three share — it can never silently agree.
    expect(signature(results[1])).toBe('valid=true#');
    expect(signature(results[0])).toBe(`load:${code}`);
    expect(signature(results[1])).not.toBe(signature(results[0]));
  });
});

describe('validateAllList — wire shape (data is dropped; mode:list carries no rows)', () => {
  test('a `data` field on the request is ignored (a list has no rows to validate)', async () => {
    const spec = { columns: { name: { field: '.name', label: 'Name' } } };
    // A bogus `data` payload would FAIL a form validate; the list path must
    // ignore it entirely (mode:list runs no DATA pass) → still valid:true.
    const out = await validateAllList({ spec, data: { whatever: 'ignored' }, files: {}, basepath: '' });
    const failed = out.results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);
    expect(out.results.every((r) => r.valid === true)).toBe(true);
    expect(out.idempotent).toBe(true);
  }, 60000);
});
