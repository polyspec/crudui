/**
 * Input text conformance for the JavaScript validator. It runs the shared validation cases of
 * tests/fixtures/text-validity, whose JSON text carries unpaired surrogate escapes that
 * `JSON.parse` keeps as unpaired code units, and unit cases for the text helpers.
 */

import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../validate/index';
import { validateList } from '../validate-list/index';
import { validateDetail } from '../validate-detail/index';
import { ComposeLoadError, MemoryLoader } from '../compose/index';
import { FormInputError } from '../validate/errors';
import { compareCodePoints, invalidTextPath, isScalarText } from './index';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

interface TextCase {
  name: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  data?: unknown;
  options?: Record<string, unknown>;
  expect: { code: string; message: string; at: string } | { valid: boolean; errors: unknown[] };
}

function outcome(run: () => unknown): unknown {
  try {
    return run();
  } catch (error) {
    if (error instanceof ComposeLoadError) return { code: error.code, message: error.message, at: error.trace.join('.') };
    if (error instanceof FormInputError) return { code: error.code, message: error.message, at: '' };
    throw error;
  }
}

const operations = {
  validate: (c: TextCase) => validate(c.spec, c.data, { ...c.options, ...(c.files ? { files: c.files } : {}) }),
  validateList: (c: TextCase) => validateList(c.spec, { ...c.options, ...(c.files ? { files: c.files } : {}) }),
  validateDetail: (c: TextCase) => validateDetail(c.spec, { ...c.options, ...(c.files ? { files: c.files } : {}) }),
};

for (const [feature, run] of Object.entries(operations)) {
  const fixture = `tests/fixtures/text-validity/${feature}/cases.json`;
  const cases: TextCase[] = JSON.parse(fs.readFileSync(path.join(ROOT, fixture), 'utf8'));
  describe(`${feature} \u2014 input text`, () => {
    test('the fixture carries cases', () => expect(cases.length).toBeGreaterThan(0));
    for (const c of cases) {
      test(c.name, () =>
        provesConformance({ features: [feature], fixture, runtime: 'javascript', case: c.name }, () => {
          expect(outcome(() => run(c))).toStrictEqual(c.expect);
        }));
    }
  });
}

describe('input text helpers', () => {
  test('unpaired surrogates are invalid and pairs are valid', () => {
    expect(['', 'a', '\ud83d\ude00', '\ue000', '\uffff'].every(isScalarText)).toBe(true);
    expect(['\ud800', 'a\udc00', '\udc00\ud800', '\ud800a', '\ud83d\ud83d'].some(isScalarText)).toBe(false);
  });

  test('code point order places supplementary characters after U+FFFF', () => {
    expect(['\ud83d\ude00', '\uffff', '\ue000', 'z', ''].sort(compareCodePoints))
      .toStrictEqual(['', 'z', '\ue000', '\uffff', '\ud83d\ude00']);
    expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0);
  });

  test('only plain objects and arrays are searched', () => {
    class Box { value = '\ud800'; }
    expect(invalidTextPath({ box: new Box(), list: [1, null, true] })).toBeUndefined();
    expect(invalidTextPath(Object.assign(Object.create(null), { a: ['\udc00'] }))).toStrictEqual(['a', '0']);
  });

  test('a container that contains itself is not searched again', () => {
    const cyclic: Record<string, unknown> = { a: '\ud800' };
    cyclic.self = cyclic;
    const shared = { b: '\udc00' };
    expect(invalidTextPath(cyclic)).toStrictEqual(['a']);
    expect(invalidTextPath({ y: shared, z: [shared] })).toStrictEqual(['y', 'b']);
    const list: unknown[] = [];
    list.push(list);
    expect(invalidTextPath(list)).toBeUndefined();
  });

  test('a custom loader document is checked when it is loaded', () => {
    const loader = new MemoryLoader({ 'base.yml': { properties: { x: { type: 'text', label: '\ud800' } } } });
    const spec = { type: 'group', properties: { $ref: 'base.yml' } };
    expect(outcome(() => validate(spec, {}, { loader }))).toStrictEqual({
      code: 'INVALID_TEXT', message: 'Text must be Unicode scalar values', at: 'base.yml.properties.x.label',
    });
    // A loader replaces the files, which are then not read.
    expect(outcome(() => validate({ type: 'group', properties: {} }, {}, { loader, files: { '\ud800': {} } })))
      .toStrictEqual({ valid: true, errors: [] });
  });
});
