// Sweep every suite through the adapter vs validator-ts; print per-suite and
// total match/mismatch/skip. Used for adapter development; the real gate is
// gate.test (vitest) and gate.js.
const fs = require('fs');
const path = require('path');
const { runLegacyCase } = require('./adapter');
const v = require(path.join(__dirname, '..', '..', 'packages', 'validator-ts', 'dist', 'index.js'));
const CASES_DIR = path.join(__dirname, '..', 'cases');

function convertSpec(spec) {
  if (spec.type === 'group' && spec.properties) return spec;
  return { type: 'group', properties: { value: spec } };
}
function convertInput(spec, input) {
  if (spec.type === 'group' && spec.properties) return input;
  if (input === '__undefined__') return { value: undefined };
  return { value: input };
}
function runJs(spec, input) {
  const validator = new v.Validator(convertSpec(spec));
  const r = validator.validate(convertInput(spec, input));
  if (r.valid) return { valid: true, error: null, field: null };
  const e = r.errors[0];
  return { valid: false, error: e.rule, field: e.path };
}

let tM = 0, tD = 0, tS = 0;
const diffs = [];
for (const f of fs.readdirSync(CASES_DIR).filter((x) => x.endsWith('.json'))) {
  const suite = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf-8'));
  let m = 0, d = 0, s = 0;
  for (const t of suite.tests) {
    for (let ci = 0; ci < t.cases.length; ci++) {
      const c = t.cases[ci];
      const legacy = runLegacyCase(t.spec, c.input);
      if (!legacy.supported) { s++; continue; }
      const js = runJs(t.spec, c.input);
      const same = legacy.valid === js.valid && (legacy.error || null) === (js.error || null);
      if (same) m++;
      else { d++; diffs.push({ f, id: t.id, ci, input: c.input, legacy, js }); }
    }
  }
  tM += m; tD += d; tS += s;
  console.log(`${f.padEnd(26)} match=${m} mismatch=${d} skip=${s}`);
}
console.log(`\nTOTAL match=${tM} mismatch=${tD} skip=${tS}`);
if (process.env.DIFFS) {
  console.log('\n--- mismatches ---');
  for (const x of diffs) {
    console.log(`${x.f} ${x.id}[${x.ci}] input=${JSON.stringify(x.input)}`);
    console.log(`  legacy valid=${x.legacy.valid} error=${x.legacy.error}`);
    console.log(`  js     valid=${x.js.valid} error=${x.js.error}`);
  }
}
