/**
 * JS v2 validate CLI — stdin/stdout BOUNDARY conformance.
 *
 * The validateV2 ENGINE is already pinned by validate.conformance.test.ts. This
 * test owns only the CLI wrapper boundary: serialization (stdin JSON →
 * validateV2 → stdout {valid,errors}), exit codes, and the LOAD-failure wire
 * shape. It does NOT re-verify rule semantics — it asserts that the wrapper does
 * not corrupt, drop, or re-shape the engine result on the way out.
 *
 * It drives the REAL binary the cross-check gateway spawns
 * (`node --import tsx bin/validate-v2.mjs`, request piped on stdin, utf-8), so a
 * regression in the wire contract (wrong exit code, a LOAD failure leaking as
 * valid:false, a dropped error field) turns this red — exactly what the gateway
 * would hit at runtime.
 *
 * JS load-failure wire (mirrors Go/Rust; distinct from PHP): exit 1, stdout
 * `{error, code}` with NO "valid" key. A LOAD failure is never valid:false.
 *
 * Do not weaken assertions. The fixture is the JS reference engine's own output;
 * the CLI must reproduce it verbatim on stdout.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/v2 -> JS package root is two levels up; repo root is four.
const JS_PKG = path.resolve(__dirname, '../..');
const CLI = path.join(JS_PKG, 'bin/validate-v2.mjs');
const FIXTURE = path.resolve(
  __dirname,
  '../../../../tests/fixtures/validate/cases.json'
);

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  basepath?: string;
  data: Record<string, unknown>;
  expected?: { valid: boolean; errors: unknown[] };
  expectLoadError?: { code: string };
}

const cases: FixtureCase[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
  parsed: Record<string, unknown> | null;
}

/** Spawn the CLI exactly as the gateway does: node --import tsx, stdin JSON. */
function runCli(req: unknown): CliRun {
  const proc = spawnSync(process.execPath, ['--import', 'tsx', CLI], {
    encoding: 'utf-8',
    input: JSON.stringify(req),
    cwd: JS_PKG,
    timeout: 20000,
    env: process.env,
  });
  if (proc.error) {
    throw new Error(`spawn failed: ${proc.error.message}`);
  }
  const stdout = (proc.stdout || '').trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  return { status: proc.status, stdout, stderr: proc.stderr || '', parsed };
}

/** Normalize numbers to float so int/float spellings (5 vs 5.0) compare equal. */
function normalize(v: unknown): unknown {
  if (typeof v === 'number') return Number(v);
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = normalize(val);
    }
    return out;
  }
  return v;
}

function requestOf(c: FixtureCase) {
  return {
    spec: c.spec,
    data: c.data ?? {},
    files: c.files ?? {},
    basepath: c.basepath ?? '',
  };
}

describe('JS validate-v2 CLI — result cases stream {valid,errors} verbatim', () => {
  for (const c of cases.filter((x) => x.expected)) {
    test(c.name, () => {
      const run = runCli(requestOf(c));
      expect(run.status, `stderr: ${run.stderr}`).toBe(0);
      expect(run.parsed, `non-JSON stdout: ${run.stdout}`).not.toBeNull();
      // exactly the two contract keys, nothing dropped or added
      expect(Object.keys(run.parsed as object).sort()).toStrictEqual([
        'errors',
        'valid',
      ]);
      expect(normalize(run.parsed)).toStrictEqual(normalize(c.expected));
    });
  }
});

describe('JS validate-v2 CLI — LOAD failure wire: exit 1, {error,code}, no valid', () => {
  for (const c of cases.filter((x) => x.expectLoadError)) {
    test(c.name, () => {
      const run = runCli(requestOf(c));
      // JS LOAD wire: exit 1.
      expect(run.status).toBe(1);
      expect(run.parsed, `non-JSON stdout: ${run.stdout}`).not.toBeNull();
      const out = run.parsed as Record<string, unknown>;
      // A LOAD failure is NOT valid:false — the "valid" key must be absent.
      expect(out.valid, 'LOAD failure must not masquerade as valid:false').toBe(
        undefined
      );
      expect(out.code).toBe(c.expectLoadError!.code);
      expect(typeof out.error).toBe('string');
      expect((out.error as string).length).toBeGreaterThan(0);
    });
  }
});

describe('JS validate-v2 CLI — malformed request: exit 1, {error} with no code', () => {
  test('empty stdin', () => {
    const proc = spawnSync(process.execPath, ['--import', 'tsx', CLI], {
      encoding: 'utf-8',
      input: '',
      cwd: JS_PKG,
      timeout: 20000,
      env: process.env,
    });
    expect(proc.status).toBe(1);
    const out = JSON.parse((proc.stdout || '').trim());
    expect(out.error).toBeTruthy();
    expect(out.code).toBe(undefined);
    expect(out.valid).toBe(undefined);
  });

  test('non-object spec', () => {
    const run = runCli({ spec: 'not-an-object', data: {} });
    expect(run.status).toBe(1);
    expect(run.parsed).not.toBeNull();
    const out = run.parsed as Record<string, unknown>;
    expect(out.error).toBeTruthy();
    expect(out.code).toBe(undefined);
    expect(out.valid).toBe(undefined);
  });

  test('invalid JSON on stdin', () => {
    const proc = spawnSync(process.execPath, ['--import', 'tsx', CLI], {
      encoding: 'utf-8',
      input: '{not json',
      cwd: JS_PKG,
      timeout: 20000,
      env: process.env,
    });
    expect(proc.status).toBe(1);
    const out = JSON.parse((proc.stdout || '').trim());
    expect(out.error).toBeTruthy();
    expect(out.valid).toBe(undefined);
  });
});

describe('JS validate-v2 CLI — every fixture case is exercised at the boundary', () => {
  test('no case is silently skipped', () => {
    for (const c of cases) {
      expect(
        c.expected !== undefined || c.expectLoadError !== undefined,
        `${c.name} must declare expected or expectLoadError`
      ).toBe(true);
    }
    expect(cases.length).toBeGreaterThan(0);
  });
});
