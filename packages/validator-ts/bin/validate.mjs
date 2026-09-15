#!/usr/bin/env node
/**
 * JS CRUDUI validate CLI — gateway subprocess (cross-check-console / compare-all).
 *
 * This is the ONLY missing CRUDUI wrapper. It exists so the cross-check gateway
 * drives the JS validator as a subprocess EXACTLY like PHP/Go/Rust — no
 * privileged in-process import. With this CLI the gateway becomes a pure
 * orchestrator: all four languages are symmetric (spawnSync, stdin JSON, utf-8),
 * no language is favored inside the gateway process.
 *
 * Contract (parallel to PHP `validate.php`, Go `cmd/validate`, Rust
 * `src/bin/validate.rs`; the gateway spawns it with spawnSync, encoding
 * utf-8, the request piped on stdin, a 10s timeout):
 *
 *   stdin  : {"spec": <object>, "data": <object>, "files"?: {key:<object>}, "basepath"?: <string>, "mode"?: "form"|"list"|"detail"}
 *   stdout : {"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}
 *
 * `spec` arrives already decoded (the gateway parses YAML; this CLI sees a plain
 * object). Three modes (default "form"); any other `mode` value is a malformed request:
 *   - form: the full CRUDUI pipeline `validate` — compose (G5) → forbidden-scan
 *     (§6) → validate (§3 + §2 G1) of `data` (the form rows).
 *   - list: the read sister `validateList` (SPEC §9) — compose (columns/search
 *     $ref/$patch) → forbidden-scan over the list tree. It validates NO rows (a
 *     list has no data; rows are injected, DB-agnostic), so `data` is ignored and
 *     a clean load is {"valid":true,"errors":[]}. The "schema shape" half
 *     (closed objects / enum / required / CellFormat polymorphism) stays with the
 *     meta-schema, not this engine.
 *   - detail: `validateDetail` — compose (root and `fields` $ref/$patch) → forbidden-scan over
 *     the detail tree. Like list, it validates no data and `data` is ignored.
 * This is a THIN wrapper: it adds no validation logic and never touches the legacy
 * Validator (R7 parallel run).
 *
 * Failure surfaces (identical in every language):
 *   - A ComposeLoadError (unresolved $ref/$patch, or a forbidden meta key) and a
 *     FormInputError (root, group or repeated data with the wrong shape) produce
 *     no validation result. Both exit 2 with stdout {"error": <message>, "code":
 *     <code>, "at": <composition trace joined with "." or "">}.
 *   - A malformed request is reported as {"error": <msg>} (no "code") with exit 1. The rules
 *     and messages are shared by every language's CLI and checked in the order listed in
 *     tests/fixtures/validator-cli/README.md: valid JSON, an object request, an object spec,
 *     a supported mode, object files with object members, then a string basepath.
 *
 * An omitted `data` member validates `{}`. A supplied `data` value is passed to
 * the validator unchanged.
 *
 * It loads the CRUDUI source (TypeScript / .ts imports) through the tsx loader, which
 * the gateway wires via `node --import tsx`. Do NOT embed spec/data in argv — the
 * request is raw JSON on stdin; no shell/string quoting is involved.
 */

import { validate, ComposeLoadError, FormInputError } from '../src/validate/index.ts';
import { validateList } from '../src/validate-list/index.ts';
import { validateDetail } from '../src/validate-detail/index.ts';

/** Emit one JSON line to stdout, then exit with the given code. */
function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(code);
}

/** Read the whole stdin stream as a utf-8 string. */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch (e) {
    emit({ error: 'Request must be valid JSON' }, 1);
  }

  // Request rules shared by every language's CLI, checked in this order.
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  let req;
  try {
    req = JSON.parse(raw);
  } catch {
    emit({ error: 'Request must be valid JSON' }, 1);
  }
  if (!isObject(req)) emit({ error: 'Request must be an object' }, 1);
  const spec = req.spec;
  if (!isObject(spec)) emit({ error: 'Request spec must be an object' }, 1);

  // `mode` selects the entry: absent or "form" validates `data`; "list" and "detail"
  // validate a specification STRUCTURE (compose + forbidden-scan) and ignore data.
  const mode = Object.hasOwn(req, 'mode') ? req.mode : 'form';
  if (mode !== 'form' && mode !== 'list' && mode !== 'detail') {
    emit({ error: 'Unsupported validation mode' }, 1);
  }

  // Composition inputs: absent or null means none.
  const files = req.files ?? null;
  if (files !== null && !isObject(files)) emit({ error: 'Request files must be an object' }, 1);
  if (files !== null && !Object.values(files).every(isObject)) {
    emit({ error: 'Request files must contain objects' }, 1);
  }
  const basepath = req.basepath ?? null;
  if (basepath !== null && typeof basepath !== 'string') {
    emit({ error: 'Request basepath must be a string' }, 1);
  }

  // An omitted `data` member validates {}; a supplied value is validated as is.
  // Ignored in list and detail modes.
  const data = Object.hasOwn(req, 'data') ? req.data : {};

  const opts = {};
  if (files !== null) opts.files = files;
  if (basepath) opts.basepath = basepath;

  let result;
  try {
    result =
      mode === 'list' ? validateList(spec, opts) : mode === 'detail' ? validateDetail(spec, opts) : validate(spec, data, opts);
  } catch (e) {
    // Load and input failures produce no validation result.
    if (e instanceof ComposeLoadError) {
      emit({ error: e.message, code: e.code, at: e.trace.join('.') }, 2);
    }
    if (e instanceof FormInputError) {
      emit({ error: e.message, code: e.code, at: '' }, 2);
    }
    // Any other throw is an internal CLI failure: { error } with no code.
    emit({ error: 'validate failed: ' + (e && e.stack ? e.stack : String(e)) }, 1);
  }

  // Normalize to the stable 5-field error shape (path, field, rule, message,
  // value), emitting [] (never null) so the stdout shape is identical across
  // the four languages.
  const errors = Array.isArray(result.errors)
    ? result.errors.map((er) => ({
        path: er.path ?? er.field ?? '',
        field: er.field ?? er.path ?? '',
        rule: er.rule ?? '',
        message: er.message ?? '',
        value: er.value ?? null,
      }))
    : [];

  emit({ valid: Boolean(result.valid), errors }, 0);
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: String(e && e.message ? e.message : e) }) + '\n');
  process.exit(1);
});
