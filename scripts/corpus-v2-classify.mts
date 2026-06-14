import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { translateV1ToV2 } from '../packages/validator-js/src/v2/translate/index';
import { scanForbiddenKeys } from '../packages/validator-js/src/v2/forbidden-scan';
import { validateV2 } from '../packages/validator-js/src/v2/validate/index';
import { ComposeLoadError } from '../packages/validator-js/src/v2/compose/index';
import type { FileLoader } from '../packages/validator-js/src/v2/compose/index';

const CORPUS = '/Users/max/Abyss/Workspace/blue/app';
const REPO = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'schema/form-spec-v2.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const vs = ajv.compile(schema);

class L implements FileLoader {
  normalize(p: string, b: string) { return p.startsWith('/') ? path.normalize(p) : path.normalize(path.join(b || '', p)); }
  load(key: string) {
    if (!fs.existsSync(key)) throw new ComposeLoadError('REF_FILE_NOT_FOUND', `nf:${key}`, [key]);
    const v1 = yaml.load(fs.readFileSync(key, 'utf8'));
    if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) throw new ComposeLoadError('REF_FILE_NOT_FOUND', `no:${key}`, [key]);
    return translateV1ToV2(v1 as any).v2 as any;
  }
}
const refLoader = new L();
const list = execSync(`find "${CORPUS}" -type f \\( -name "*.yml" -o -name "*.yaml" \\) -path "*/Spec/*"`, { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').map((s) => s.trim()).filter(Boolean).sort();

// classify a single failure into category
type Cat = 'corpus-data' | 'translator-bug' | 'v2-gap';
function classify(stage: string, reason: string, ctx: { errKw?: string; ap?: string; iPath?: string; surviving?: string }): { cat: Cat; label: string } {
  if (stage === 'load') {
    if (/duplicated mapping key/.test(reason)) return { cat: 'corpus-data', label: 'yaml duplicate key' };
    if (/non-object root/.test(reason)) return { cat: 'corpus-data', label: 'non-object yaml root' };
    return { cat: 'corpus-data', label: 'yaml parse error' };
  }
  if (stage === 'validate') {
    if (/REF_FILE_NOT_FOUND/.test(reason)) return { cat: 'corpus-data', label: 'broken $ref target (file absent in corpus)' };
    if (/duplicated mapping key/.test(reason)) return { cat: 'corpus-data', label: 'yaml duplicate key in $ref target' };
    if (/FORBIDDEN_META_KEY/.test(reason)) return { cat: 'translator-bug', label: 'x-key field name not stripped in properties' };
    return { cat: 'translator-bug', label: 'validate throw' };
  }
  if (stage === 'forbidden') {
    return { cat: 'translator-bug', label: 'x-key field name not stripped in properties (forbidden-scan)' };
  }
  // schema stage — classify by error keyword + path shape
  const ip = ctx.iPath || '';
  const kw = ctx.errKw || '';
  if (kw === 'required' && /type/.test(reason)) {
    return { cat: 'translator-bug', label: 'root/group missing type — translator omits type:group injection' };
  }
  if (/\/description$|\/label$|\/placeholder$|\/help$|\/prepend$|\/append$/.test(ip)) {
    // Content slot: null content very common -> v2 Content has no null branch
    return { cat: 'v2-gap', label: 'Content slot null (empty description:/label:) — v2 Content lacks null branch' };
  }
  if (/\/items(\/|$)/.test(ip)) {
    return { cat: 'v2-gap', label: 'items static map with LangMap labels — v2 Items lacks {value:LangMap} branch' };
  }
  if (/\/design(\/|$)/.test(ip)) {
    return { cat: 'translator-bug', label: 'design.class/style emitted as {} on null condition-class merge' };
  }
  if (/\/behavior(\/|$)/.test(ip)) {
    return { cat: 'translator-bug', label: 'behavior.on* boolean flag passed through — v2 BehaviorAction expects script' };
  }
  if (kw === 'additionalProperties') {
    return { cat: 'v2-gap', label: `unmodeled surviving key +${ctx.ap}` };
  }
  if (kw === 'not' || kw === 'propertyNames') {
    return { cat: 'translator-bug', label: 'forbidden key name survived into schema (x-key etc.)' };
  }
  return { cat: 'v2-gap', label: `schema ${kw} @${ip}` };
}

interface Rec { spec: string; stage: string; cat: Cat; label: string; reason: string }
const recs: Rec[] = [];
let total = 0, translated = 0, fullPass = 0;
const failedSpecs = new Set<string>();

for (const file of list) {
  total++;
  const rel = file.replace(CORPUS + '/', '');
  let v1: any;
  try { v1 = yaml.load(fs.readFileSync(file, 'utf8')); } catch (e: any) {
    const c = classify('load', `yaml parse: ${e.message}`, {}); recs.push({ spec: rel, stage: 'load', ...c, reason: String(e.message).split('\n')[0] }); failedSpecs.add(rel); continue;
  }
  if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) {
    const c = classify('load', 'non-object root', {}); recs.push({ spec: rel, stage: 'load', ...c, reason: 'non-object root' }); failedSpecs.add(rel); continue;
  }
  let v2: any;
  try { v2 = translateV1ToV2(v1 as any).v2; translated++; } catch (e: any) {
    recs.push({ spec: rel, stage: 'translate', cat: 'translator-bug', label: 'translator throw', reason: String(e.message).slice(0, 120) }); failedSpecs.add(rel); continue;
  }
  let ok = true;
  if (!vs(v2)) {
    ok = false;
    // take the first MOST-INFORMATIVE error
    const errs = vs.errors || [];
    const pick = errs.find((e) => e.keyword === 'additionalProperties') || errs.find((e) => e.keyword === 'required') || errs.find((e) => e.keyword === 'not' || e.keyword === 'propertyNames') || errs[0];
    const c = classify('schema', pick.message || '', { errKw: pick.keyword, ap: (pick.params as any).additionalProperty, iPath: pick.instancePath });
    recs.push({ spec: rel, stage: 'schema', ...c, reason: `${pick.keyword} ${pick.instancePath} ${pick.message}` });
    failedSpecs.add(rel);
  }
  try { scanForbiddenKeys(v2, []); } catch (e: any) {
    ok = false; const c = classify('forbidden', String(e.message), {}); recs.push({ spec: rel, stage: 'forbidden', ...c, reason: String(e.message).slice(0, 120) }); failedSpecs.add(rel);
  }
  try { validateV2(v2, {}, { loader: refLoader, basepath: path.dirname(file) }); } catch (e: any) {
    ok = false; const c = classify('validate', `${e?.code ?? ''}: ${e.message}`, {}); recs.push({ spec: rel, stage: 'validate', ...c, reason: `${e?.code ?? 'throw'}: ${String(e.message).split('\n')[0].slice(0, 100)}` }); failedSpecs.add(rel);
  }
  if (ok) fullPass++;
}

function tally<T>(arr: T[], k: (x: T) => string) { const m = new Map<string, number>(); for (const x of arr) m.set(k(x), (m.get(k(x)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }

const byCat = tally(recs, (r) => r.cat);
const byCatLabel = tally(recs, (r) => `${r.cat} :: ${r.label}`);
// distinct failed specs (a spec can have multiple stage failures)
const out = {
  total,
  translated,
  fullPass,
  fullPassPct: ((fullPass / total) * 100).toFixed(1) + '%',
  distinctFailedSpecs: failedSpecs.size,
  failRecords: recs.length,
  byCategory: byCat,
  byCategoryLabel: byCatLabel,
  exemplars: byCatLabel.map(([lbl]) => {
    const r = recs.find((x) => `${x.cat} :: ${x.label}` === lbl)!;
    return { label: lbl, spec: r.spec, reason: r.reason };
  }),
};
fs.writeFileSync(path.join(REPO, 'scripts/corpus-v2-classified.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
