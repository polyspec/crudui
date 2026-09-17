/**
 * Input text of the generator operations (docs/spec/input-text.md). The generator families of
 * tests/fixtures/text-validity run here in process; the native generator suite runs the same cases
 * through every language's program and records the conformance evidence.
 */

import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindButtons, bindForm, buildDetail, buildList, compileForm, ComposeLoadError, createForm, FormInputError,
  type FormTemplate,
} from './index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface TextCase {
  name: string;
  spec?: Record<string, unknown>;
  template?: FormTemplate;
  data?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  record?: Record<string, unknown>;
  options?: Record<string, unknown>;
  action?: { method: string; args: unknown[] };
  expect: 'pass' | { code: string; message: string; at: string };
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

const template = (c: TextCase) => c.template ?? compileForm(c.spec ?? {});
const operations: Record<string, (c: TextCase) => unknown> = {
  compileForm: c => failure(() => compileForm(c.spec ?? {}, c.options)),
  bindForm: c => failure(() => bindForm(template(c), c.data, c.options)),
  createForm: c => {
    const created = failure(() => createForm(template(c), c.data, c.options));
    if (!c.action || created !== 'pass') return created;
    const form = createForm(template(c), c.data, c.options);
    const method = (form as unknown as Record<string, (...args: unknown[]) => unknown>)[c.action.method];
    return failure(() => method.apply(form, c.action!.args));
  },
  buildList: c => failure(() => buildList(c.spec ?? {}, c.rows, c.options)),
  buildDetail: c => failure(() => buildDetail(c.spec ?? {}, c.record, c.options)),
};

for (const [feature, run] of Object.entries(operations)) {
  const cases: TextCase[] = JSON.parse(
    fs.readFileSync(path.join(ROOT, `tests/fixtures/text-validity/${feature}/cases.json`), 'utf8'));
  describe(`${feature} — input text`, () => {
    for (const c of cases) test(c.name, () => expect(run(c)).toStrictEqual(c.expect));
  });
}

describe('input text of the other form operations', () => {
  test('buttons check the template, the data and the options', () => {
    const compiled = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
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
