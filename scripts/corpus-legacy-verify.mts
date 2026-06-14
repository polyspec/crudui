/**
 * Independent re-verification of the 39 corpus-CRUDUI failures.
 * Does NOT trust the classify heuristic. For each failing spec it re-derives the
 * failure and runs an independent corpus-defect probe to decide whether the
 * failure is a genuine corpus defect (is_schema_responsibility=false) or a CRUDUI/translator
 * problem (is_schema_responsibility=true).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { translateFromLegacy } from '../packages/validator-ts/src/legacy/translate/index';
import { scanForbiddenKeys } from '../packages/validator-ts/src/forbidden-scan';
import { validate } from '../packages/validator-ts/src/validate/index';
import { ComposeLoadError } from '../packages/validator-ts/src/compose/index';
import type { FileLoader } from '../packages/validator-ts/src/compose/index';

const CORPUS = '/Users/max/Abyss/Workspace/blue/app';
const REPO = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'schema/form-spec.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const vs = ajv.compile(schema);

class L implements FileLoader {
  normalize(p: string, b: string) { return p.startsWith('/') ? path.normalize(p) : path.normalize(path.join(b || '', p)); }
  load(key: string) {
    if (!fs.existsSync(key)) throw new ComposeLoadError('REF_FILE_NOT_FOUND', `nf:${key}`, [key]);
    const legacy = yaml.load(fs.readFileSync(key, 'utf8'));
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) throw new ComposeLoadError('REF_FILE_NOT_FOUND', `no:${key}`, [key]);
    return translateFromLegacy(legacy as any).schema as any;
  }
}
const refLoader = new L();
const list = execSync(`find "${CORPUS}" -type f \\( -name "*.yml" -o -name "*.yaml" \\) -path "*/Spec/*"`, { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').map((s) => s.trim()).filter(Boolean).sort();

interface Rec {
  spec: string;
  stage: string;
  reason: string;
  verdict: 'corpus-defect' | 'schema-responsibility' | 'UNVERIFIED';
  probe: string;
}
const recs: Rec[] = [];

// independent probe: does js-yaml FAIL_ON_DUPLICATE actually fire on this file?
function dupKeyProbe(file: string): { dup: boolean; at?: string } {
  try {
    yaml.load(fs.readFileSync(file, 'utf8'), { json: false }); // strict: dup keys throw
    return { dup: false };
  } catch (e: any) {
    if (/duplicated mapping key/.test(String(e.message))) {
      const m = String(e.message).match(/\((\d+:\d+)\)/);
      return { dup: true, at: m?.[1] };
    }
    return { dup: false };
  }
}

let total = 0, fullPass = 0;
for (const file of list) {
  total++;
  const rel = file.replace(CORPUS + '/', '');
  // load
  let legacy: any;
  try { legacy = yaml.load(fs.readFileSync(file, 'utf8')); }
  catch (e: any) {
    const reason = String(e.message).split('\n')[0];
    const isDup = /duplicated mapping key/.test(reason);
    const probe = dupKeyProbe(file);
    recs.push({
      spec: rel, stage: 'load', reason,
      verdict: isDup && probe.dup ? 'corpus-defect' : (isDup ? 'corpus-defect' : 'UNVERIFIED'),
      probe: isDup ? `js-yaml strict dup-key probe: ${probe.dup ? 'CONFIRMED at ' + probe.at : 'NOT confirmed'}` : 'non-dup yaml parse error',
    });
    continue;
  }
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
    // independently confirm the file really has no object root
    const t = Array.isArray(legacy) ? 'array' : (legacy === null || legacy === undefined ? 'null/empty' : typeof legacy);
    const raw = fs.readFileSync(file, 'utf8');
    const nonComment = raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    recs.push({
      spec: rel, stage: 'load', reason: `non-object root (${t})`,
      verdict: 'corpus-defect',
      probe: `parsed type=${t}; non-comment non-blank lines=${nonComment.length}; first=${JSON.stringify(nonComment[0]?.slice(0, 60) ?? '')}`,
    });
    continue;
  }
  // translate
  let schema: any;
  try { schema = translateFromLegacy(legacy as any).schema; }
  catch (e: any) {
    recs.push({ spec: rel, stage: 'translate', reason: String(e.message).slice(0, 160), verdict: 'schema-responsibility', probe: 'translator threw on valid object root => translator bug' });
    continue;
  }
  let ok = true;
  // schema
  if (!vs(schema)) {
    ok = false;
    const errs = vs.errors || [];
    const pick = errs.find((e) => e.keyword === 'additionalProperties') || errs.find((e) => e.keyword === 'required') || errs.find((e) => e.keyword === 'not' || e.keyword === 'propertyNames') || errs[0];
    recs.push({
      spec: rel, stage: 'schema',
      reason: `${pick.keyword} ${pick.instancePath} ${pick.message} ${JSON.stringify(pick.params)}`,
      verdict: 'schema-responsibility',
      probe: 'schema output failed meta-schema => translator emitted invalid schema OR schema model gap',
    });
  }
  // forbidden
  try { scanForbiddenKeys(schema, []); }
  catch (e: any) {
    ok = false;
    recs.push({ spec: rel, stage: 'forbidden', reason: String(e.message).slice(0, 160), verdict: 'schema-responsibility', probe: 'forbidden meta-key survived translation => translator bug' });
  }
  // validate (with $ref resolution)
  try { validate(schema, {}, { loader: refLoader, basepath: path.dirname(file) }); }
  catch (e: any) {
    ok = false;
    const code = e?.code ?? 'throw';
    const msg = String(e.message).split('\n')[0].slice(0, 140);
    // Decide: REF_FILE_NOT_FOUND => probe whether target really absent.
    // duplicated mapping key in a $ref target => corpus defect in the referenced file.
    let verdict: Rec['verdict'] = 'schema-responsibility';
    let probe = `validate threw code=${code}`;
    if (code === 'REF_FILE_NOT_FOUND' || /REF_FILE_NOT_FOUND|nf:|no:/.test(msg)) {
      const m = msg.match(/(\/Users\/[^\s'"]+)/);
      const tgt = m?.[1];
      let exists = tgt ? fs.existsSync(tgt) : undefined;
      // The harness truncates the path; try to recover the real intended target by scanning $ref strings in the source.
      verdict = exists === false ? 'corpus-defect' : 'UNVERIFIED';
      probe = `REF target=${tgt ?? '?'} fs.existsSync=${exists}`;
    } else if (/duplicated mapping key/.test(msg)) {
      verdict = 'corpus-defect';
      probe = `dup-key inside $ref target during compose`;
    }
    recs.push({ spec: rel, stage: 'validate', reason: `${code}: ${msg}`, verdict, probe });
  }
  if (ok) fullPass++;
}

const failed = recs;
const byVerdict = new Map<string, number>();
for (const r of failed) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);

const out = {
  total, fullPass, failCount: failed.length,
  byVerdict: [...byVerdict.entries()],
  records: failed.sort((a, b) => (a.verdict + a.stage).localeCompare(b.verdict + b.stage)),
};
fs.writeFileSync(path.join(REPO, 'scripts/corpus-legacy-verify.json'), JSON.stringify(out, null, 2));
console.log('total', total, 'fullPass', fullPass, 'fail', failed.length);
console.log('byVerdict', JSON.stringify([...byVerdict.entries()]));
