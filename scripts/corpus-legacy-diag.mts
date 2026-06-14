import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { translateFromLegacy } from '../packages/validator-ts/src/legacy/translate/index';

const CORPUS = '/Users/max/Abyss/Workspace/blue/app';
const REPO = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'schema/crudui.schema.json'), 'utf8'));
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
  let legacy: any;
  try { legacy = yaml.load(fs.readFileSync(f, 'utf8')); } catch { continue; }
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) continue;
  let schema: any;
  try { schema = translateFromLegacy(legacy as any).schema; } catch { continue; }
  if (vs(schema)) continue;
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
