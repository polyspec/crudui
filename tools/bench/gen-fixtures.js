#!/usr/bin/env node
/**
 * gen-fixtures.js — materialize the benchmark spec+input pairs as plain JSON.
 *
 * The four validators all consume the same JSON spec via the same
 * {spec, input} -> {valid, error, field} protocol. To keep the benchmark
 * fair, every language driver must read the *identical* spec and input, so the
 * specs are written here once as canonical JSON and the Go/Rust/PHP drivers load
 * the resulting .json files. No validator parses YAML.
 *
 * Output (tools/bench/fixtures/):
 *   contact.spec.json     contact.input.json
 *   large.spec.json       large.input.json (generated current-schema workload)
 *
 * Deterministic: stable key order from the declared objects, no timestamps.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'fixtures');

/** Build the small current-schema contact form: six fields, rules in `validate`. */
function contactSpec() {
  return {
    type: 'group',
    properties: {
      name: { type: 'text', label: 'Name', validate: { required: true, minlength: 2, maxlength: 100 } },
      email: { type: 'email', label: 'Email', validate: { required: true, email: true } },
      phone: { type: 'text', label: 'Phone', validate: { minlength: 10, maxlength: 20 } },
      subject: {
        type: 'select',
        label: 'Subject',
        items: { general: 'General Inquiry', support: 'Technical Support', sales: 'Sales', partnership: 'Partnership' },
        validate: { required: true },
      },
      message: { type: 'textarea', label: 'Message', validate: { required: true, minlength: 10, maxlength: 2000 } },
      newsletter: { type: 'checkbox', label: 'Subscribe to newsletter' },
    },
  };
}

/** Build the large current-schema workload: 80 required text fields. */
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
 * large: an EMPTY form ({}) against the generated current-schema workload.
 * The name is retained as the benchmark case label.
 */
const CONTACT_INPUT = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '0212345678',
  subject: 'support',
  message: 'Hello, I have a question about my recent order and shipping.',
  newsletter: true,
};

const LARGE_INPUT = {};

const CASES = [
  {
    name: 'contact',
    spec: contactSpec,
    input: CONTACT_INPUT,
  },
  {
    name: 'large',
    spec: largeCurrentSpec,
    input: LARGE_INPUT,
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const c of CASES) {
  const spec = c.spec();
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
