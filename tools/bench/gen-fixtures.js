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
 *   productnft.spec.json  productnft.input.json (generated current-schema workload)
 *
 * Deterministic: stable key order from the parsed document, no timestamps.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'fixtures');

/** Load the small current-schema YAML fixture. */
function loadSpec(relPath) {
  const abs = path.join(ROOT, relPath);
  return YAML.parse(fs.readFileSync(abs, 'utf8'));
}

/** Build the large current-schema workload; legacy ProductNft declarations are not benchmark input. */
function largeCurrentSpec() {
  const properties = {};
  for (let i = 1; i <= 80; i += 1) {
    const name = `field_${String(i).padStart(3, '0')}`;
    properties[name] = { type: 'text', validate: { required: true } };
  }
  return { type: 'group', properties };
}

/**
 * Inputs must produce the SAME validation result on all four backends — the
 * benchmark compares throughput on an identical, cross-language-agreed
 * workload, not on a payload that happens to split the validators.
 *
 * contact: a realistic, fully-valid submission. The contact spec has no
 * multiple ([]-suffixed) fields, so JS/PHP/Go/Rust all return valid=true.
 *
 * productnft: an EMPTY form ({}) against the generated current-schema workload.
 * The name is retained as the benchmark case label; no legacy ProductNft
 * declaration is loaded by the benchmark.
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
    name: 'productnft',
    spec: null,
    input: PRODUCTNFT_INPUT,
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const c of CASES) {
  const spec = c.spec === null ? largeCurrentSpec() : loadSpec(c.spec);
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
