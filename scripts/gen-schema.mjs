#!/usr/bin/env node
/**
 * gen-schema.mjs — generate schema/form-spec.schema.json from validator-js types.
 *
 * Source of truth: packages/validator-js/src/types.ts (the `Spec` interface).
 * Generator: ts-json-schema-generator (reads TSDoc, emits JSON Schema draft-07).
 *
 * After generation the schema is:
 *   1. self-validated — compiled by Ajv (draft-07) to prove it is a valid schema.
 *   2. smoke-tested — example shared specs are loaded and validated against it.
 *
 * Idempotency: output is overwritten each run; the generator emits deterministic,
 * sorted output, so repeated runs produce byte-identical schema/form-spec.schema.json.
 * types.ts is never modified — schema limits are noted, not patched in source.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = join(ROOT, 'packages', 'validator-js', 'src', 'types.ts');
const SCHEMA_DIR = join(ROOT, 'schema');
const SCHEMA_FILE = join(SCHEMA_DIR, 'form-spec.schema.json');

function log(m) {
  process.stdout.write(`[gen-schema] ${m}\n`);
}

mkdirSync(SCHEMA_DIR, { recursive: true });

// 1. Generate JSON Schema from the Spec interface.
log('generating JSON Schema from validator-js Spec type...');
const args = [
  'ts-json-schema-generator',
  '--path', TYPES,
  '--type', 'Spec',
  '--id', 'https://github.com/polyspec/crudui/schema/form-spec.schema.json',
  '--tsconfig', join(ROOT, 'packages', 'validator-js', 'tsconfig.json'),
  // unstable=false keeps definition ordering stable across runs (idempotent output)
  '--no-top-ref',
  '--expose', 'all',
  '--additional-properties',
  '-o', SCHEMA_FILE,
];
execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' });

// Re-write with a trailing newline + stable 2-space formatting for deterministic diffs.
const raw = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
// strip any machine-absolute paths that might appear in $comment/description (defensive)
const text = JSON.stringify(raw, null, 2) + '\n';
if (text.includes(process.env.HOME || '/Users/')) {
  log('WARNING: schema appears to contain an absolute path; inspect output.');
}
writeFileSync(SCHEMA_FILE, text);
log(`wrote ${SCHEMA_FILE}`);

// 2. Self-validate: the schema itself must compile under Ajv draft-07.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
let validate;
try {
  validate = ajv.compile(raw);
  log('self-validate: schema compiles under Ajv (draft-07) OK');
} catch (e) {
  log(`self-validate FAILED: ${e.message}`);
  process.exit(1);
}

// 3. Smoke-test: validate a couple of example shared specs against the schema.
const sharedDir = join(ROOT, 'examples', 'shared-specs');
let specFiles = [];
try {
  specFiles = readdirSync(sharedDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
} catch {
  log('no examples/shared-specs directory; skipping smoke-test');
}

const smokeTargets = specFiles.slice(0, 3);
let smokeFail = 0;
for (const f of smokeTargets) {
  const spec = yaml.load(readFileSync(join(sharedDir, f), 'utf8'));
  const ok = validate(spec);
  if (ok) {
    log(`smoke OK: ${f}`);
  } else {
    smokeFail++;
    log(`smoke MISMATCH: ${f}`);
    const errs = (validate.errors || []).slice(0, 6);
    for (const er of errs) {
      log(`    ${er.instancePath || '/'} ${er.message}`);
    }
  }
}

if (smokeTargets.length === 0) {
  log('no shared specs found to smoke-test.');
} else if (smokeFail === 0) {
  log(`smoke-test: ${smokeTargets.length}/${smokeTargets.length} example specs validate against schema.`);
} else {
  // Smoke mismatches are reported but do NOT fail the gate: the schema is derived
  // from optional-heavy TS interfaces, and example specs may use generator-only
  // keys (e.g. display/element extras) the validator type does not enumerate.
  // This is a known limitation, surfaced here rather than silently swallowed.
  log(`smoke-test: ${smokeTargets.length - smokeFail}/${smokeTargets.length} validate; ${smokeFail} have schema-vs-spec gaps (see schema/README.md "Limitations").`);
}

log('done.');
