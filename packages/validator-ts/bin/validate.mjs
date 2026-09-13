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
 *   stdin  : {"spec": <object>, "data": <object>, "files"?: {key:<object>}, "basepath"?: <string>, "mode"?: "form"|"list"}
 *   stdout : {"valid": <bool>, "errors": [{path, field, rule, message, value}, ...]}
 *
 * `spec` arrives already decoded (the gateway parses YAML; this CLI sees a plain
 * object). Two modes (default "form"):
 *   - form: the full CRUDUI pipeline `validate` — compose (G5) → forbidden-scan
 *     (§6) → validate (§3 + §2 G1) of `data` (the form rows).
 *   - list: the read sister `validateList` (SPEC §9) — compose (columns/search
 *     $ref/$patch) → forbidden-scan over the list tree. It validates NO rows (a
 *     list has no data; rows are injected, DB-agnostic), so `data` is ignored and
 *     a clean load is {"valid":true,"errors":[]}. The "schema shape" half
 *     (closed objects / enum / required / CellFormat polymorphism) stays with the
 *     meta-schema, not this engine.
 * This is a THIN wrapper: it adds no validation logic and never touches the legacy
 * Validator (R7 parallel run).
 *
 * Failure surfaces (identical in every language):
 *   - A ComposeLoadError (unresolved $ref/$patch, or a forbidden meta key) and a
 *     FormInputError (root, group or repeated data with the wrong shape) produce
 *     no validation result. Both exit 2 with stdout {"error": <message>, "code":
 *     <code>, "at": <composition trace joined with "." or "">}.
 *   - A malformed request (bad JSON, missing/non-object spec) is reported as
 *     {"error": <msg>} (no "code") with exit 1.
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
    emit({ error: 'Failed to read stdin: ' + (e && e.message ? e.message : e) }, 1);
  }

  if (!raw || !raw.trim()) {
    emit({ error: 'Empty stdin request' }, 1);
  }

  let req;
  try {
    req = JSON.parse(raw);
  } catch (e) {
    emit({ error: 'Failed to parse request JSON: ' + (e && e.message ? e.message : e) }, 1);
  }

  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    emit({ error: 'Request must be a JSON object' }, 1);
  }

  const spec = req.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    emit({ error: "Request `spec` must be an object" }, 1);
  }

  // `mode` selects the entry: "form" (default) validates `data`; "list" validates
  // a list-spec STRUCTURE (compose + forbidden-scan) and ignores rows (SPEC §9).
  const mode = req.mode === 'list' ? 'list' : 'form';

  // An omitted `data` member validates {}; a supplied value is validated as is.
  // Ignored in list mode.
  const data = Object.hasOwn(req, 'data') ? req.data : {};

  // Optional virtual file set + basepath for $ref resolution. The gateway sends
  // the same { files, basepath } every wrapper receives; omitting them here would
  // make JS report REF_FILE_NOT_FOUND on a spec the other three resolve — a
  // wrapper-induced idempotency break.
  const opts = {};
  if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
    opts.files = req.files;
  }
  if (typeof req.basepath === 'string' && req.basepath) {
    opts.basepath = req.basepath;
  }

  let result;
  try {
    result = mode === 'list' ? validateList(spec, opts) : validate(spec, data, opts);
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
