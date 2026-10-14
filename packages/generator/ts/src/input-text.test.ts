/**
 * Input text of the generator operations (docs/spec/input-text.md). The generator families of
 * tests/fixtures/text-validity run here in process; the native generator suite runs the same cases
 * through every language's program and records the conformance evidence.
 */

import { describe, expect, test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindButtons, bindForm, buildDetail, buildList, compileForm, ComposeLoadError, createForm, FormInputError,
} from './index';
import { checkFormTemplate } from './template-shape';
import { isRecord } from './util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

interface TextCase {
  name: string;
  spec?: Record<string, unknown>;
  /** A compiled template as decoded JSON, which the operation checks at run time. */
  template?: unknown;
  data?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  record?: Record<string, unknown>;
  options?: Record<string, unknown>;
  action?: { method: string; args: unknown[] };
  /** 'pass', or the code, message and composition trace of the failure. */
  expect: unknown;
}

/** A member of a case that is absent or an object. */
function optionalRecord(value: unknown, what: string): Record<string, unknown> | undefined {
  assert(value === undefined || isRecord(value), `${what} is an object`);
  return value;
}

/** A case of a text-validity fixture, checked member by member. */
function textCase(value: unknown): TextCase {
  assert(isRecord(value), 'a case is an object');
  const { name, template, rows } = value;
  assert(typeof name === 'string', 'a case has a name');
  assert(rows === undefined || (Array.isArray(rows) && rows.every(isRecord)), `${name}: rows is a list of objects`);
  const action = value.action === undefined ? undefined : formAction(value.action, name);
  const spec = optionalRecord(value.spec, `${name}: spec`);
  const data = optionalRecord(value.data, `${name}: data`);
  const record = optionalRecord(value.record, `${name}: record`);
  const options = optionalRecord(value.options, `${name}: options`);
  return {
    name,
    expect: value.expect,
    ...(spec ? { spec } : {}),
    ...(template !== undefined ? { template } : {}),
    ...(data ? { data } : {}),
    ...(rows ? { rows } : {}),
    ...(record ? { record } : {}),
    ...(options ? { options } : {}),
    ...(action ? { action } : {}),
  };
}

/** The action of a case: the method of a form instance and its arguments. */
function formAction(value: unknown, name: string): { method: string; args: unknown[] } {
  assert(isRecord(value), `${name}: action is an object`);
  const { method, args } = value;
  assert(typeof method === 'string' && Array.isArray(args), `${name}: action has a method and arguments`);
  return { method, args };
}

/** A string argument of an action. */
function text(value: unknown, what: string): string {
  assert(typeof value === 'string', `${what} is a string`);
  return value;
}

/** Call the method of a form instance that an action names with its arguments. */
function runFormAction(form: ReturnType<typeof createForm>, { method, args }: { method: string; args: unknown[] }): unknown {
  const [first, second, third] = args;
  switch (method) {
    case 'setValue': return form.setValue(text(first, 'path'), second);
    case 'getValue': return form.getValue(text(first, 'path'));
    case 'setData': assert(isRecord(first), 'data is an object'); return form.setData(first);
    case 'addRow': assert(isRecord(second), 'the row options are an object'); return form.addRow(text(first, 'path'), second);
    case 'copyRow': return form.copyRow(text(first, 'path'), text(second, 'key'));
    case 'removeRow': return form.removeRow(text(first, 'path'), text(second, 'key'));
    case 'moveRow': assert(typeof third === 'number', 'the index is a number'); return form.moveRow(text(first, 'path'), text(second, 'key'), third);
    case 'rekeyRow': return form.rekeyRow(text(first, 'path'), text(second, 'key'), text(third, 'new key'));
    default: throw new Error(`Unknown form method: ${method}`);
  }
}

function failure(run: () => unknown): unknown {
  try {
    run();
    return 'pass';
  } catch (error) {
    if (error instanceof ComposeLoadError) return { code: error.code, message: error.message, at: error.trace.join('.') };
    if (error instanceof FormInputError) return { code: error.code, message: error.message, at: '' };
    throw error;
  }
}

const template = (c: TextCase): unknown => c.template ?? compileForm(c.spec ?? {});
const operations: Record<string, (c: TextCase) => unknown> = {
  compileForm: c => failure(() => compileForm(c.spec ?? {}, c.options)),
  // @ts-expect-error: a fixture template is decoded JSON that may break the template shape or its text, which bindForm checks at run time.
  bindForm: c => failure(() => bindForm(template(c), c.data, c.options)),
  createForm: c => {
    // @ts-expect-error: a fixture template is decoded JSON that may break the template shape or its text, which createForm checks at run time.
    const created = failure(() => createForm(template(c), c.data, c.options));
    const action = c.action;
    if (!action || created !== 'pass') return created;
    const accepted = template(c);
    checkFormTemplate(accepted);
    const form = createForm(accepted, c.data, c.options);
    return failure(() => runFormAction(form, action));
  },
  buildList: c => failure(() => buildList(c.spec ?? {}, c.rows, c.options)),
  buildDetail: c => failure(() => buildDetail(c.spec ?? {}, c.record, c.options)),
};

for (const [feature, run] of Object.entries(operations)) {
  const decoded: unknown = JSON.parse(
    fs.readFileSync(path.join(ROOT, `tests/fixtures/text-validity/${feature}/cases.json`), 'utf8'));
  assert(Array.isArray(decoded), `the ${feature} cases are a list`);
  const cases = decoded.map(textCase);
  describe(`${feature} — input text`, () => {
    for (const c of cases) test(c.name, () => expect(run(c)).toStrictEqual(c.expect));
  });
}

describe('input text of the other form operations', () => {
  test('buttons check the template, the data and the options', () => {
    const compiled = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
    // @ts-expect-error: a lone surrogate is no Language; the options are checked at run time.
    expect(failure(() => bindButtons(compiled, { name: '\ud800' }, { language: '\udc00' }))).toStrictEqual({
      code: 'INVALID_FORM_INPUT', message: 'Text must be Unicode scalar values: data.name', at: '',
    });
  });

  test('a custom loader document is checked when it is loaded', () => {
    const loader = { normalize: (p: string) => p, load: () => ({ properties: { x: { type: '\udc00' } } }) };
    expect(failure(() => compileForm({ type: 'group', properties: { $ref: 'b.yml' } }, { loader }))).toStrictEqual({
      code: 'INVALID_TEXT', message: 'Text must be Unicode scalar values', at: 'b.yml.properties.x.type',
    });
    expect(failure(() => buildList({ columns: { $ref: 'c.yml' } }, [], { loader }))).toStrictEqual({
      code: 'INVALID_TEXT', message: 'Text must be Unicode scalar values', at: 'c.yml.properties.x.type',
    });
  });
});
