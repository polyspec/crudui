/**
 * Real corpus v1→v2 conversion + v2 validation harness (read-only over corpus).
 *
 * The input corpus is read-only. Only Spec/*.yml files are
 * read. Nothing in the corpus is created or modified. This script lives in the
 * polyspec repo.
 *
 * Pipeline per spec:
 *   load    — read + js-yaml parse the v1 spec file
 *   translate — translateV1ToV2 (v1 spec object → v2 spec object)
 *   schema  — ajv validate the v2 output against the v2 meta-schema (root Field)
 *   forbidden — scanForbiddenKeys over the v2 output (zero meta keys at any depth)
 *   validate — validateV2(v2, {}) structural validation with empty data
 *
 * A failure records {spec, stage, reason}. Aggregates pass/fail and top reasons.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { translateV1ToV2 } from '../packages/validator-ts/src/v2/translate/index';
import { scanForbiddenKeys } from '../packages/validator-ts/src/v2/forbidden-scan';
import { validateV2 } from '../packages/validator-ts/src/v2/validate/index';
import { ComposeLoadError } from '../packages/validator-ts/src/v2/compose/index';
import type { FileLoader } from '../packages/validator-ts/src/v2/compose/index';

const corpusInput = process.argv[2];
if (!corpusInput) throw new Error('Usage: provide the corpus directory as the first argument');
const CORPUS = path.resolve(corpusInput);
const REPO = path.resolve(import.meta.dirname, '..');
const SCHEMA = path.join(REPO, 'schema/polyspec-v2.schema.json');

// --- enumerate corpus form specs: every */Spec/*.{yml,yaml} ---
const list = execSync(
  `find "${CORPUS}" -type f \\( -name "*.yml" -o -name "*.yaml" \\) -path "*/Spec/*"`,
  { encoding: 'utf8', maxBuffer: 1 << 26 }
)
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .sort();

// compile meta-schema once (root #/definitions/Field)
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

/**
 * Disk-backed loader for `$ref`: resolves a relative ref against the spec's
 * directory inside the READ-ONLY corpus, reads the v1 yaml, and translates it
 * to v2 on the fly so the v2 compose engine sees v2 documents. Read-only —
 * never writes to the corpus.
 */
class TranslatingDiskLoader implements FileLoader {
  normalize(p: string, basepath: string): string {
    if (p.startsWith('/')) return path.normalize(p);
    return path.normalize(path.join(basepath || '', p));
  }
  load(key: string): Record<string, unknown> {
    if (!fs.existsSync(key)) {
      throw new ComposeLoadError('REF_FILE_NOT_FOUND', `$ref file not found: ${key}`, [key]);
    }
    const v1 = yaml.load(fs.readFileSync(key, 'utf8'));
    if (v1 === null || typeof v1 !== 'object' || Array.isArray(v1)) {
      throw new ComposeLoadError('REF_FILE_NOT_FOUND', `$ref non-object: ${key}`, [key]);
    }
    return translateV1ToV2(v1 as Record<string, unknown>).v2 as Record<string, unknown>;
  }
}
const refLoader = new TranslatingDiskLoader();

type Stage = 'load' | 'translate' | 'schema' | 'forbidden' | 'validate';
interface Fail {
  spec: string;
  stage: Stage;
  reason: string;
}

const fails: Fail[] = [];
let total = 0;
let translated = 0;
let schemaPass = 0;
let forbiddenPass = 0;
let validatePass = 0; // full pass (all stages)

// classify a schema ajv error into a short reason bucket
function schemaReason(errs: any[] | null | undefined): string {
  if (!errs || !errs.length) return 'schema: unknown';
  // prefer additionalProperties (unmodeled v1 feature surviving translation)
  const ap = errs.find((e) => e.keyword === 'additionalProperties');
  if (ap) return `schema:additionalProperties ${ap.instancePath || '/'} +${ap.params?.additionalProperty}`;
  const req = errs.find((e) => e.keyword === 'required');
  if (req) return `schema:required ${req.instancePath || '/'} ${req.params?.missingProperty}`;
  const e = errs[0];
  return `schema:${e.keyword} ${e.instancePath || '/'} ${e.message ?? ''}`.trim();
}

for (const file of list) {
  total++;
  const rel = file.replace(CORPUS + '/', '');
  let v1: any;
  try {
    const text = fs.readFileSync(file, 'utf8');
    v1 = yaml.load(text);
    if (v1 === null || typeof v1 !== 'object' || Array.isArray(v1)) {
      fails.push({ spec: rel, stage: 'load', reason: `non-object root (${Array.isArray(v1) ? 'array' : typeof v1})` });
      continue;
    }
  } catch (e: any) {
    fails.push({ spec: rel, stage: 'load', reason: `yaml parse: ${String(e.message ?? e).slice(0, 120)}` });
    continue;
  }

  // --- translate ---
  let v2: any;
  let notes: any[];
  try {
    const r = translateV1ToV2(v1 as Record<string, unknown>);
    v2 = r.v2;
    notes = r.notes;
    translated++;
  } catch (e: any) {
    fails.push({ spec: rel, stage: 'translate', reason: `throw: ${String(e.message ?? e).slice(0, 160)}` });
    continue;
  }

  // --- schema (meta-schema, root Field) ---
  let okSchema = false;
  try {
    okSchema = validateSchema(v2) as boolean;
    if (okSchema) schemaPass++;
    else fails.push({ spec: rel, stage: 'schema', reason: schemaReason(validateSchema.errors as any[]) });
  } catch (e: any) {
    fails.push({ spec: rel, stage: 'schema', reason: `schema-throw: ${String(e.message ?? e).slice(0, 120)}` });
  }

  // --- forbidden-scan ---
  let okForbidden = false;
  try {
    scanForbiddenKeys(v2, []);
    okForbidden = true;
    forbiddenPass++;
  } catch (e: any) {
    fails.push({ spec: rel, stage: 'forbidden', reason: String(e.message ?? e).slice(0, 160) });
  }

  // --- validate (structural, empty data) ---
  // only meaningful when the v2 spec is a group with properties (root form).
  let okValidate = false;
  try {
    validateV2(v2 as Record<string, unknown>, {}, { loader: refLoader, basepath: path.dirname(file) });
    okValidate = true;
  } catch (e: any) {
    fails.push({ spec: rel, stage: 'validate', reason: `${e?.code ?? 'throw'}: ${String(e.message ?? e).slice(0, 140)}` });
  }

  if (okSchema && okForbidden && okValidate) validatePass++;
}

// --- aggregate ---
function tally(key: (f: Fail) => string) {
  const m = new Map<string, number>();
  for (const f of fails) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const byStage = tally((f) => f.stage);
// reason bucket: stage + normalized reason head (strip instance paths / field names)
function bucket(f: Fail): string {
  let r = f.reason
    .replace(/\/[A-Za-z0-9_./[\]-]+/g, '/<path>')
    .replace(/\+[A-Za-z0-9_]+/g, '+<key>')
    .replace(/"[^"]*"/g, '"<x>"')
    .replace(/at [A-Za-z0-9_.<>[\]/]+/g, 'at <path>');
  return `${f.stage} | ${r}`;
}
const byReason = tally(bucket);

// schema additionalProperties keys (which surviving keys are unmodeled) — feature gap signal
const apKeys = new Map<string, number>();
for (const f of fails) {
  if (f.stage === 'schema') {
    const m = f.reason.match(/\+([A-Za-z0-9_$]+)/);
    if (m) apKeys.set(m[1], (apKeys.get(m[1]) ?? 0) + 1);
  }
}
const apTop = [...apKeys.entries()].sort((a, b) => b[1] - a[1]);

const out = {
  total,
  translated,
  schemaPass,
  forbiddenPass,
  fullPass: validatePass,
  failCount: fails.length,
  byStage,
  topReasons: byReason.slice(0, 20),
  schemaAdditionalPropertyKeys: apTop.slice(0, 25),
  samples: fails.slice(0, 0), // filled below per-stage
};

// representative samples: up to 2 per stage
const sampleByStage: Record<string, Fail[]> = {};
for (const f of fails) {
  (sampleByStage[f.stage] ??= []).push(f);
}
const samples: Fail[] = [];
for (const st of Object.keys(sampleByStage)) {
  samples.push(...sampleByStage[st].slice(0, 3));
}
(out as any).samples = samples;

fs.writeFileSync(path.join(REPO, 'scripts/corpus-v2-result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
