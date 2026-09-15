/**
 * Execute JavaScript, PHP, Go and Rust validator CLIs and compare their results.
 * Each process receives JSON on stdin and has a ten-second timeout. Responses
 * must match the CLI exit status and JSON contract. Data errors preserve path,
 * field, rule, message and value; load and input failures use failure.
 */

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { ROOT } from './engine.mjs';

const JS_PKG = path.join(ROOT, 'packages/validator-ts');
const PHP_PKG = path.join(ROOT, 'packages/validator-php');
const GO_PKG = path.join(ROOT, 'packages/validator-go');
const RUST_PKG = path.join(ROOT, 'packages/validator-rust');

const JS_CLI = path.join(JS_PKG, 'bin/validate.mjs');
const PHP_CLI = path.join(PHP_PKG, 'bin/validate.php');
const GO_BIN = process.env.CRUDUI_CROSS_CHECK_GO_VALIDATOR ?? path.join(GO_PKG, 'validate');
const RUST_BIN = process.env.CRUDUI_CROSS_CHECK_RUST_VALIDATOR
  ?? path.join(RUST_PKG, 'target/release/validate');

/**
 * Validate one request through all four language CLIs.
 *
 * @param {object} req { spec, data, files?, basepath? }
 * @returns {Promise<{results: object[], idempotent: boolean, mismatch: object|null}>}
 */
export async function validateAll(req) {
  const payload = {
    spec: req.spec,
    data: req.data ?? {},
    files: req.files ?? {},
    basepath: req.basepath ?? '',
  };
  return fanOut(payload);
}

/**
 * Validate list composition and forbidden keys through all four language CLIs.
 * List requests contain a specification and composition inputs, without row data.
 *
 * @param {object} req { spec, files?, basepath? }
 * @returns {Promise<{results: object[], idempotent: boolean, mismatch: object|null}>}
 */
export async function validateAllList(req) {
  const payload = {
    spec: req.spec,
    files: req.files ?? {},
    basepath: req.basepath ?? '',
    mode: 'list',
  };
  return fanOut(payload);
}

/**
 * Validate detail composition and forbidden keys through all four language CLIs.
 * Detail requests contain a specification and composition inputs, without a record.
 *
 * @param {object} req { spec, files?, basepath? }
 * @returns {Promise<{results: object[], idempotent: boolean, mismatch: object|null}>}
 */
export async function validateAllDetail(req) {
  const payload = {
    spec: req.spec,
    files: req.files ?? {},
    basepath: req.basepath ?? '',
    mode: 'detail',
  };
  return fanOut(payload);
}

/** Execute all four validator CLIs on one payload and compare the results. */
function fanOut(payload) {
  const results = [runJs(payload), runPhp(payload), runGo(payload), runRust(payload)];
  const { idempotent, mismatch } = compareIdempotency(results);
  return { results, idempotent, mismatch };
}

function runJs(payload) {
  // Resolve tsx from the validator package to execute the TypeScript source.
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
 * Execute a validator CLI and check its exit status and response fields. Every
 * language uses the same responses:
 *   validation result:     exit 0, stdout { valid, errors:[5-field] }
 *   load or input failure: exit 2, stdout exactly { error, code, at }
 *   malformed request:     exit 1, stdout { error }
 */
function runCli(lang, cmd, args, cwd, payload) {
  const t0 = performance.now();
  const proc = spawnSync(cmd, args, {
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    timeout: 10000,
    cwd,
    env: process.env,
  });
  const ms = Math.round(performance.now() - t0);

  if (proc.error) return cliFail(lang, ms, proc.error.message);
  if (proc.signal || proc.status === null) {
    return cliFail(lang, ms, `${lang} CLI terminated (${proc.signal ?? 'no exit status'})`);
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

  if (!isObject(parsed)) {
    return cliFail(lang, ms, proc.stderr || `invalid ${lang} JSON response (exit ${proc.status})`);
  }

  if (proc.status === 2) {
    if (Object.keys(parsed).sort().join(',') !== 'at,code,error' ||
        typeof parsed.code !== 'string' || !parsed.code ||
        typeof parsed.error !== 'string' || !parsed.error ||
        typeof parsed.at !== 'string') {
      return cliFail(lang, ms, `invalid ${lang} failure response`);
    }
    return {
      lang,
      ok: true,
      valid: false,
      errors: [],
      ms,
      failure: { code: parsed.code, message: parsed.error, at: parsed.at },
    };
  }

  if (proc.status !== 0) {
    return cliFail(lang, ms, proc.stderr || parsed.error || `${lang} CLI exited ${proc.status}`);
  }
  if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
      !parsed.errors.every(isValidationError) ||
      parsed.valid !== (parsed.errors.length === 0) ||
      Object.keys(parsed).length !== 2) {
    return cliFail(lang, ms, `invalid ${lang} validation response`);
  }

  return {
    lang,
    ok: true,
    valid: parsed.valid,
    errors: parsed.errors,
    ms,
    failure: null,
  };
}

function cliFail(lang, ms, message) {
  return {
    lang,
    ok: false,
    valid: false,
    errors: [],
    ms,
    failure: null,
    error: String(message || '').trim() || `${lang} CLI failed`,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidationError(error) {
  return isObject(error) &&
    ['path', 'field', 'rule', 'message'].every(key => typeof error[key] === 'string') &&
    Object.hasOwn(error, 'value');
}

/** Stable comparison signature: the complete failure record, or valid + sorted errors. */
export function signature(r) {
  if (!r.ok) return `__error__:${r.error || ''}`;
  if (r.failure) return `failure:${r.failure.code}|${r.failure.message}|${r.failure.at}`;
  const sorted = [...r.errors].sort((a, b) =>
    (a.field + '|' + a.rule).localeCompare(b.field + '|' + b.rule)
  );
  const key = sorted.map((e) => `${e.path}|${e.field}|${e.rule}|${e.message}|${JSON.stringify(e.value)}`);
  return `valid=${r.valid}#${key.join(';')}`;
}

/** Compare every required validator, including execution failures. */
export function compareIdempotency(results) {
  const expected = ['js', 'php', 'go', 'rust'];
  const missing = expected.filter(lang => !results.some(result => result.lang === lang));
  const complete = results.length === expected.length && missing.length === 0 &&
    results.every(result => result.ok && expected.includes(result.lang));
  const sigs = results.map((result) => ({ lang: result.lang, sig: signature(result) }));
  const distinct = new Set(sigs.map(result => result.sig));
  if (complete && distinct.size === 1) return { idempotent: true, mismatch: null };
  // Group langs by signature so the client can show which langs diverged.
  const groups = {};
  for (const s of sigs) {
    (groups[s.sig] ??= []).push(s.lang);
  }
  return {
    idempotent: false,
    mismatch: {
      missing,
      groups: Object.entries(groups).map(([sig, langs]) => ({ langs, signature: sig })),
      detail: results.map((r) => ({
        lang: r.lang,
        ok: r.ok,
        valid: r.valid,
        failure: r.failure,
        errors: r.errors,
        error: r.error ?? null,
      })),
    },
  };
}
