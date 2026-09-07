import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { translateV1ToV2 } from '../packages/validator-ts/src/v2/translate/index';

const corpusInput = process.argv[2];
if (!corpusInput) throw new Error('Usage: provide the corpus directory as the first argument');
const CORPUS = path.resolve(corpusInput);
const REPO = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'schema/polyspec-v2.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const vs = ajv.compile(schema);
const list = execSync(
  `find "${CORPUS}" -type f \\( -name "*.yml" -o -name "*.yaml" \\) -path "*/Spec/*"`,
  { encoding: 'utf8', maxBuffer: 1 << 26 }
).split('\n').map((s) => s.trim()).filter(Boolean).sort();

const kw = new Map<string, number>();
const detail = new Map<string, number>();
const exemplar = new Map<string, string>();
for (const f of list) {
  let v1: any;
  try { v1 = yaml.load(fs.readFileSync(f, 'utf8')); } catch { continue; }
  if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) continue;
  let v2: any;
  try { v2 = translateV1ToV2(v1 as any).v2; } catch { continue; }
  if (vs(v2)) continue;
  for (const e of (vs.errors || [])) {
    kw.set(e.keyword, (kw.get(e.keyword) || 0) + 1);
    let d = e.keyword;
    if (e.keyword === 'additionalProperties') d += ' +' + (e.params as any).additionalProperty;
    else if (e.keyword === 'required') d += ' ' + (e.params as any).missingProperty + ' @' + e.instancePath.replace(/\/[^/]*$/, '');
    else if (e.keyword === 'type') d += ' .' + e.instancePath.split('/').pop() + ' ' + e.message;
    detail.set(d, (detail.get(d) || 0) + 1);
    if (!exemplar.has(d)) exemplar.set(d, f.replace(CORPUS + '/', '') + ' @' + e.instancePath);
  }
}
console.log('=== keyword counts ===');
for (const [k, n] of [...kw.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), k);
console.log('\n=== detail top 30 (with exemplar) ===');
for (const [k, n] of [...detail.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(String(n).padStart(5), k, '||', exemplar.get(k));
}
