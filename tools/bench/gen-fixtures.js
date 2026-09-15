#!/usr/bin/env node
/**
 * gen-fixtures.js — materialize the benchmark spec+input pairs as plain JSON.
 *
 * The four validators all consume the same JSON spec via the same
 * {spec, input} -> {valid, error, field} protocol. To keep the benchmark
 * fair, every language driver must read the *identical* spec and input. YAML
 * parsing is a JS-only concern, so we resolve the YAML to canonical JSON here,
 * once, and the Go/Rust/PHP drivers load the resulting .json files. No validator
 * parses YAML. The specs parse under the default unique-key rule: a duplicate key
 * is an authoring error here, not a last-wins merge to tolerate silently.
 *
 * Output (tools/bench/fixtures/):
 *   contact.spec.json     contact.input.json
 *   large-form.spec.json  large-form.input.json
 *
 * Deterministic: stable key order from the parsed document, no timestamps.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'fixtures');

/** Load a Legacy YAML spec the same way the parity suite does. */
function loadSpec(relPath) {
  const abs = path.join(ROOT, relPath);
  return YAML.parse(fs.readFileSync(abs, 'utf8'));
}

/**
 * Inputs must produce the SAME validation result on all four backends — the
 * benchmark compares throughput on an identical, cross-language-agreed
 * workload, not on a payload that happens to split the validators.
 *
 * contact: a realistic, fully-valid submission. The contact spec has no
 * multiple ([]-suffixed) fields, so JS/PHP/Go/Rust all return valid=true.
 *
 * large-form: the EMPTY form ({}). The raw Legacy LargeForm.yml carries
 * literal []-suffixed keys (sub_category_seqs[], cover_images[], ...) for its
 * `multiple` fields, and the four validators normalize that []-suffix
 * differently when matching input keys — a populated payload makes PHP diverge
 * from JS/Go/Rust on those array fields (a pre-existing naming-normalization
 * difference, outside this benchmark's scope to fix). The empty form is the
 * input all four agree on (valid=false, required @ common.name) while still
 * driving every one of the 80 fields' required/conditional checks through the
 * rule engine. Verified identical across JS/PHP/Go/Rust before committing.
 */
const CONTACT_INPUT = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '0212345678',
  subject: 'support',
  message: 'Hello, I have a question about my recent order and shipping.',
  newsletter: true,
};

const PRODUCTNFT_INPUT = {};

const CASES = [
  {
    name: 'contact',
    spec: 'examples/legacy/shared-specs/contact.yml',
    input: CONTACT_INPUT,
  },
  {
    name: 'large-form',
    spec: 'tests/fixtures/specs/LargeForm.yml',
    input: PRODUCTNFT_INPUT,
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const c of CASES) {
  const spec = loadSpec(c.spec);
  fs.writeFileSync(
    path.join(OUT_DIR, `${c.name}.spec.json`),
    JSON.stringify(spec, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(OUT_DIR, `${c.name}.input.json`),
    JSON.stringify(c.input, null, 2) + '\n'
  );
  console.log(`[gen-fixtures] wrote ${c.name}.spec.json + ${c.name}.input.json`);
}
