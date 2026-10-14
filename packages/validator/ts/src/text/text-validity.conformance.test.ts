/**
 * Input text conformance for the JavaScript validator. It runs the shared validation cases of
 * tests/fixtures/text-validity, whose JSON text carries unpaired surrogate escapes that
 * `JSON.parse` keeps as unpaired code units, and unit cases for the text helpers.
 */

import assert from 'node:assert/strict';
import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../validate/index';
import { validateList } from '../validate-list/index';
import { validateDetail } from '../validate-detail/index';
import { ComposeLoadError, MemoryLoader } from '../compose/index';
import { FormInputError } from '../validate/errors';
import { compareCodePoints, isScalarText, valueFailure } from './index';
import { isRecord } from '../record';
import { provesConformance } from '../../../../../tests/conformance/evidence.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

interface TextCase {
  name: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  data?: unknown;
  options?: Record<string, unknown>;
  expect: unknown;
}

/** Whether a value is a set of composition files: an object of JSON objects. */
const isFileSet = (value: unknown): value is Record<string, Record<string, unknown>> =>
  isRecord(value) && Object.values(value).every(isRecord);

/** A case of a fixture, checked to hold a name and a spec and, when present, files and options. */
function textCase(item: unknown, at: string): TextCase {
  if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.spec)) throw new TypeError(`${at}: no name and spec`);
  const { files, options } = item;
  if (files !== undefined && !isFileSet(files)) throw new TypeError(`${at}: the files are no file set`);
  if (options !== undefined && !isRecord(options)) throw new TypeError(`${at}: the options are no object`);
  return {
    name: item.name, spec: item.spec, expect: item.expect,
    ...(files === undefined ? {} : { files }),
    ...('data' in item ? { data: item.data } : {}),
    ...(options === undefined ? {} : { options }),
  };
}

/** The list of the fixture `fixture`, each item read by `read`. */
function readCases<T>(fixture: string, read: (item: unknown, at: string) => T): T[] {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, fixture), 'utf8'));
  if (!Array.isArray(value)) throw new TypeError(`${fixture} holds no list of cases`);
  return value.map((item: unknown, index) => read(item, `case ${index} of ${fixture}`));
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
  const cases = readCases(fixture, textCase);
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

/** A value graph of tests/fixtures/text-validity/value-graphs.json, built with shared containers. */
interface Graph { at: string[]; shape: 'doubled' | 'chain' | 'flat' | 'self-twice'; size?: number; leaf?: string }

interface GraphCase extends TextCase { graph: Graph }

const SHAPES = ['doubled', 'chain', 'flat', 'self-twice'] as const;
const isShape = (value: unknown): value is Graph['shape'] => SHAPES.some((shape) => shape === value);

/** A case of the value graphs, checked to hold a graph of a path, a shape and, when present, a size and a leaf. */
function graphCase(item: unknown, at: string): GraphCase {
  const graph: unknown = isRecord(item) ? item.graph : undefined;
  const names: unknown[] = isRecord(graph) && Array.isArray(graph.at) ? graph.at : [];
  const path = names.filter((name): name is string => typeof name === 'string');
  if (!isRecord(graph) || path.length === 0 || path.length !== names.length || !isShape(graph.shape)) {
    throw new TypeError(`${at}: no graph of a path and a shape`);
  }
  const { size, leaf } = graph;
  if (size !== undefined && typeof size !== 'number') throw new TypeError(`${at}: the size is no number`);
  if (leaf !== undefined && typeof leaf !== 'string') throw new TypeError(`${at}: the leaf is no string`);
  return {
    ...textCase(item, at),
    graph: { at: path, shape: graph.shape, ...(size === undefined ? {} : { size }), ...(leaf === undefined ? {} : { leaf }) },
  };
}

function build({ shape, size = 0, leaf }: Graph): unknown {
  if (shape === 'self-twice') {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    loop.again = loop;
    return loop;
  }
  if (shape === 'flat') return Array.from<unknown>({ length: size }, () => leaf);
  let value: unknown = leaf;
  for (let i = 0; i < size; i++) value = shape === 'doubled' ? [value, value] : [value];
  return value;
}

describe('value graphs \u2014 input limits', () => {
  const fixture = 'tests/fixtures/text-validity/value-graphs.json';
  const cases = readCases(fixture, graphCase);
  test('the fixture carries cases', () => expect(cases.length).toBeGreaterThan(0));
  for (const c of cases) {
    test(c.name, () => {
      const inputs: Record<string, unknown> = { spec: c.spec, files: c.files, data: c.data };
      const [name, ...members] = c.graph.at;
      let target: unknown = inputs[name];
      for (const member of members.slice(0, -1)) {
        assert(typeof target === 'object' && target !== null, `${c.name}: ${member} lies in an object`);
        target = Reflect.get(target, member);
      }
      assert(typeof target === 'object' && target !== null, `${c.name}: the graph lies in an object`);
      Reflect.set(target, members[members.length - 1], build(c.graph));
      // Each case is one test within the runner's per-test limit, which a walk that grows with the
      // tree a value denotes (2^40 nodes) never meets.
      expect(outcome(() => operations.validate(c))).toStrictEqual(c.expect);
    });
  }
});

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
    expect(valueFailure({ box: new Box(), list: [1, null, true] })).toBeUndefined();
    expect(valueFailure(Object.assign(Object.create(null), { a: ['\udc00'] }))).toStrictEqual({ text: ['a', '0'] });
  });

  test('a value is walked as the tree it denotes', () => {
    const cyclic: Record<string, unknown> = { a: '\ud800' };
    cyclic.self = cyclic;
    const shared = { b: '\udc00' };
    expect(valueFailure(cyclic)).toStrictEqual({ text: ['a'] });
    expect(valueFailure({ y: shared, z: [shared] })).toStrictEqual({ text: ['y', 'b'] });
    const list: unknown[] = [];
    list.push(list);
    expect(valueFailure(list)).toStrictEqual({ limit: true });
    // A class instance is one node: its members are not walked.
    class Box { items = Array.from({ length: 2_000_000 }, () => 'x'); }
    expect(valueFailure([new Box()])).toBeUndefined();
  });

  test('a custom loader document is checked when it is loaded', () => {
    const loader = new MemoryLoader({ 'base.yml': { properties: { x: { type: 'text', label: '\ud800' } } } });
    const spec = { type: 'group', properties: { $ref: 'base.yml' } };
    expect(outcome(() => validate(spec, {}, { loader }))).toStrictEqual({
      code: 'INVALID_TEXT', message: 'Text must be Unicode scalar values', at: 'base.yml.properties.x.label',
    });
    // A loader replaces the files, which are then not read.
    expect(outcome(() => validate({ type: 'group', properties: {} }, {}, { loader, files: { '\ud800': {} } })))
      .toStrictEqual({ valid: true, errors: [], hidden: [] });
  });
});
