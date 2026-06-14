/**
 * 4-language CRUDUI validate fan-out — ALL FOUR via stdin-JSON CLI subprocess.
 *
 * The gateway is a pure orchestrator: it imports NO language's validator. Every
 * language (JS included) runs as a spawnSync CLI, so the four are fully
 * symmetric — no language is favored inside the gateway process. This is what
 * makes a 4-language agreement evidence of engine equivalence, not an artifact
 * of one privileged call path:
 *
 *   JS  : node --import tsx packages/validator-js/bin/validate.mjs
 *   PHP : php packages/validator-php/bin/validate.php       (cwd = pkg root)
 *   Go  : packages/validator-go/validate                    (compiled)
 *   Rust: packages/validator-rust/target/release/validate  (compiled)
 *
 * Shared contract:
 *   request : { spec, data, files?, basepath? }
 *   per lang: { lang, ok, valid, errors:[{path,field,rule,message,value}], ms, loadError }
 *
 * Each CLI runs the same CRUDUI stack: compose (G5) → forbidden-scan (§6) → validate
 * (§3 + §2 G1). A composition LOAD failure (unresolved $ref / $patch / forbidden
 * meta key) is NOT valid:false — it is the spec failing to come into existence.
 * It surfaces as `loadError: { code, message }` with `valid:false`, distinct from
 * a data-level validation failure (CRUDUI core invariant; closes the legacy
 * LargeForm.yml:873 gap).
 *
 * The subprocess protocol mirrors tests/runner/compare-all.js (spawnSync, utf-8,
 * input piped on stdin, 10s timeout, cwd = package root).
 */

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { ROOT } from './engine.mjs';

const JS_PKG = path.join(ROOT, 'packages/validator-js');
const PHP_PKG = path.join(ROOT, 'packages/validator-php');
const GO_PKG = path.join(ROOT, 'packages/validator-go');
const RUST_PKG = path.join(ROOT, 'packages/validator-rust');

const JS_CLI = path.join(JS_PKG, 'bin/validate.mjs');
const PHP_CLI = path.join(PHP_PKG, 'bin/validate.php');
const GO_BIN = path.join(GO_PKG, 'validate');
const RUST_BIN = path.join(RUST_PKG, 'target/release/validate');

/**
 * Validate one request across all four languages in parallel.
 *
 * @param {object} req { spec, data, files?, basepath? }
 * @returns {Promise<{results: object[], idempotent: boolean|null, mismatch: object|null}>}
 */
export async function validateAll(req) {
  const payload = {
    spec: req.spec,
    data: req.data ?? {},
    files: req.files ?? {},
    basepath: req.basepath ?? '',
  };

  const [js, php, go, rust] = await Promise.all([
    Promise.resolve(runJs(payload)),
    Promise.resolve(runPhp(payload)),
    Promise.resolve(runGo(payload)),
    Promise.resolve(runRust(payload)),
  ]);

  const results = [js, php, go, rust];
  const { idempotent, mismatch } = compareIdempotency(results);
  return { results, idempotent, mismatch };
}

// --- The four CRUDUI validate CLIs (JS symmetric with PHP/Go/Rust) ---------------

function runJs(payload) {
  // `node --import tsx` runs the .ts CRUDUI source through the tsx loader (the same
  // validate the conformance gate imports). tsx resolves from cwd = JS_PKG.
  return runCli('js', process.execPath, ['--import', 'tsx', JS_CLI], JS_PKG, payload);
}

function runPhp(payload) {
  return runCli('php', 'php', [PHP_CLI], PHP_PKG, payload);
}

function runGo(payload) {
  return runCli('go', GO_BIN, [], GO_PKG, payload);
}

function runRust(payload) {
  return runCli('rust', RUST_BIN, [], RUST_PKG, payload);
}

/**
 * Spawn a CRUDUI validate CLI and normalize its stdout into the shared envelope.
 *
 * Per-language load-failure wire shapes (all mapped to the same loadError
 * envelope so the four agree on a LOAD failure as much as on a valid result):
 *   PHP : exit 0, stdout { valid:false, errors:[{ rule:"compose", code, message }] }
 *   Go  : exit 1, stdout { error, code, trace }                (no "valid" key)
 *   Rust: exit 2, stdout { error, code }                       (no "valid" key)
 *   JS  : exit 1, stdout { error, code }                       (no "valid" key)
 *   any valid result: stdout { valid, errors:[5-field] }
 */
function runCli(lang, cmd, args, cwd, payload) {
  const t0 = performance.now();
  const proc = spawnSync(cmd, args, {
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    timeout: 10000,
    cwd,
    // tsx may need PATH/node_modules resolution; inherit the gateway env.
    env: process.env,
  });
  const ms = Math.round(performance.now() - t0);

  if (proc.error) {
    return cliFail(lang, ms, proc.error.message);
  }

  const stdout = (proc.stdout || '').trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }

  // No parseable stdout at all → the CLI failed to run (missing binary, etc.).
  if (!parsed) {
    return cliFail(lang, ms, proc.stderr || `empty ${lang} output (exit ${proc.status})`);
  }

  // Load-failure variants. Go/Rust/JS report { error, code } with no "valid".
  if (parsed.code && parsed.valid === undefined) {
    return {
      lang,
      ok: true,
      valid: false,
      errors: [],
      ms,
      loadError: { code: parsed.code, message: parsed.error || parsed.message || '' },
    };
  }
  // Plain { error } envelope with neither code nor valid → a request/exec failure.
  if (parsed.error !== undefined && parsed.valid === undefined && !parsed.code) {
    return cliFail(lang, ms, parsed.error);
  }

  // PHP synthetic compose error: a single error with rule "compose" + a code.
  const errs = Array.isArray(parsed.errors) ? parsed.errors : [];
  const composeErr = errs.find((e) => e && e.rule === 'compose' && e.code);
  if (composeErr) {
    return {
      lang,
      ok: true,
      valid: false,
      errors: [],
      ms,
      loadError: { code: composeErr.code, message: composeErr.message || '' },
    };
  }

  return {
    lang,
    ok: true,
    valid: Boolean(parsed.valid),
    errors: normErrors(errs),
    ms,
    loadError: null,
  };
}

function cliFail(lang, ms, message) {
  return {
    lang,
    ok: false,
    valid: false,
    errors: [],
    ms,
    loadError: null,
    error: String(message || '').trim() || `${lang} CLI failed`,
  };
}

// --- Normalization + idempotency comparison ----------------------------------

/**
 * Normalize an error record to the canonical 5 fields, coercing numeric `value`
 * to a stable form so f64-vs-int serialization never trips a false mismatch.
 */
function normErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => ({
    path: e.path ?? e.field ?? '',
    field: e.field ?? e.path ?? '',
    rule: e.rule ?? '',
    message: e.message ?? '',
    value: normValue(e.value),
  }));
}

function normValue(v) {
  if (typeof v === 'number') {
    // Collapse 5 vs 5.0 (Rust f64 vs JS/PHP int) to a single canonical number.
    return Number.isFinite(v) ? Number(v) : v;
  }
  return v;
}

/** Stable comparison signature: valid + load code + sorted errors. */
export function signature(r) {
  if (!r.ok) return `__error__:${r.error || ''}`;
  if (r.loadError) return `load:${r.loadError.code}`;
  const sorted = [...r.errors].sort((a, b) =>
    (a.field + '|' + a.rule).localeCompare(b.field + '|' + b.rule)
  );
  const key = sorted.map((e) => `${e.path}|${e.field}|${e.rule}|${e.message}|${JSON.stringify(e.value)}`);
  return `valid=${r.valid}#${key.join(';')}`;
}

/**
 * Idempotent iff every language that ran (ok) shares one signature. A failed CLI
 * (ok:false) never silently agrees: it carries a distinct signature. Fewer than
 * two languages ran → no judgement is possible (null).
 */
export function compareIdempotency(results) {
  const runnable = results.filter((r) => r.ok);
  if (runnable.length < 2) {
    return { idempotent: null, mismatch: null };
  }
  const sigs = runnable.map((r) => ({ lang: r.lang, sig: signature(r) }));
  const distinct = new Set(sigs.map((s) => s.sig));
  if (distinct.size <= 1) {
    return { idempotent: true, mismatch: null };
  }
  // Group langs by signature so the client can show which langs diverged.
  const groups = {};
  for (const s of sigs) {
    (groups[s.sig] ??= []).push(s.lang);
  }
  return {
    idempotent: false,
    mismatch: {
      groups: Object.entries(groups).map(([sig, langs]) => ({ langs, signature: sig })),
      detail: results.map((r) => ({
        lang: r.lang,
        ok: r.ok,
        valid: r.valid,
        loadError: r.loadError,
        errors: r.errors,
        error: r.error ?? null,
      })),
    },
  };
}
