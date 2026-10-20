/**
 * Writes the cases of the form template shape (docs/spec/form-runtime.md, CURT-092): `bindForm`, `bindButtons` and
 * `createForm` accept only a template that has exactly the shape `compileForm` produces. The TypeScript reference writes
 * every expectation; no implementation writes one by hand. Run from the checkout root:
 *
 *   node tests/fixtures/template-shape/generate.mts
 *
 * A case is `{ name, note, requirements, operation, template, data, options, expect }`: the template is the decoded JSON of
 * the value the reference receives, reshaped as the case says; `expect` is `"pass"`, or `{ code, message, at }` with `at`
 * empty, since the rule names no location.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@polyspec/crudui-generator-core';

interface Case { name: string; note: string; requirements: string[]; operation: string; template: unknown; data: unknown; options: unknown; expect: unknown }
type Runner = (template: unknown, data: unknown, options: unknown) => unknown;

const REQUIREMENT = 'CURT-092';
/** The reference functions take the values of a case as they are, invalid ones included, so they are called untyped. */
/** Calls a reference function with the case values; the result is held as unknown. */
function call(fn: (...args: never[]) => unknown, args: unknown[]): unknown {
  const value: unknown = Reflect.apply(fn, undefined, args);
  return value;
}
const runners: Record<string, Runner> = {
  bindForm: (template, data, options) => call(core.bindForm, [template, data, options]),
  bindButtons: (template, data, options) => call(core.bindButtons, [template, data, options]),
  createForm: (template, data, options) => call(core.createForm, [template, data, options]),
};
const compileForm = (spec: unknown): unknown => call(core.compileForm, [spec]);

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'cases.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The compiled template of the spec of the reference tests, as decoded JSON. */
function compiled(): Record<string, unknown> {
  const template: unknown = JSON.parse(JSON.stringify(compileForm({ type: 'group', properties: { name: { type: 'text' } } })));
  if (!isRecord(template)) throw new Error('a compiled template is an object');
  return template;
}

function firstField(template: Record<string, unknown>): Record<string, unknown> {
  const fields: unknown = template.fields;
  if (!Array.isArray(fields)) throw new Error('a compiled template has a list of fields');
  const field: unknown = fields[0];
  if (!isRecord(field)) throw new Error('a compiled field is an object');
  return field;
}

/** The shape violations of template-shape.test.ts: each changes the compiled template. */
const VIOLATIONS: [string, (t: Record<string, unknown>) => void][] = [
  ['missing-fields', t => { delete t.fields; }],
  ['fields-not-a-list', t => { t.fields = {}; }],
  ['field-not-an-object', t => { if (!Array.isArray(t.fields)) throw new Error('fields'); t.fields.push('name'); }],
  ['field-without-children', t => { delete firstField(t).children; }],
  ['field-with-unknown-member', t => { firstField(t).label = 'Name'; }],
  ['missing-buttons', t => { delete t.buttons; }],
  ['buttons-not-a-list', t => { t.buttons = {}; }],
  ['button-not-an-object', t => { t.buttons = [[]]; }],
  ['unknown-member', t => { t.version = 1; }],
  ['another-kind', t => { t.kind = 'other'; }],
  ['null-key-prefix', t => { t.keyPrefix = null; }],
  ['string-action', t => { t.action = '/save'; }],
];

/** The reference result of one case: "pass", or the failure that the reference raises. */
function observe(run: () => unknown): unknown {
  try {
    run();
    return 'pass';
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'ERROR';
    return { code, message: error.message, at: '' };
  }
}

const DATA = { name: 'a' };
const cases: Case[] = [];
for (const [operation, run] of Object.entries(runners)) {
  const add = (name: string, note: string, template: unknown) => {
    cases.push({ name: `${operation}-${name}`, note, requirements: [REQUIREMENT], operation, template, data: DATA, options: {},
      expect: observe(() => run(template, DATA, {})) });
  };
  add('compiled', 'a template that compileForm writes is accepted.', compiled());
  const optional = compiled();
  optional.keyPrefix = 'p';
  optional.action = { url: '/save' };
  optional.description = 'Any value.';
  add('optional-members', 'the optional members keyPrefix, action and description are accepted.', optional);
  for (const [name, change] of VIOLATIONS) {
    const template = compiled();
    change(template);
    add(name, 'a template with this shape violation is refused with the message of the shape rule, and no location.', template);
  }
}

// The reference writes every expectation of these cases: the result of the reference on each case is the expectation.
writeFileSync(output, `${JSON.stringify(cases, null, 2)}\n`);
console.log(`wrote ${cases.length} cases to ${output}`);
