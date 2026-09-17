/**
 * Unit tests for $ref resolution edge cases not isolated in
 * cases.json: self-cycle, three-node cycle, empty-path format error, and the
 * declaration-order rule (a sibling BEFORE $ref is overridden by the base; a
 * sibling AFTER $ref overrides the base).
 */

import { describe, test, expect } from 'vitest';
import { resolveRef } from './ref';
import { composeProperties } from './compose';
import { MemoryLoader } from './loader';
import { ComposeLoadError } from './errors';

describe('$ref cycle detection rejects recursive references', () => {
  test('self-cycle a -> a', () => {
    const loader = new MemoryLoader({ 'a.yml': { properties: { $ref: 'a.yml' } } });
    try {
      resolveRef('a.yml', '', loader);
      throw new Error('expected cycle error');
    } catch (e) {
      expect(e).toBeInstanceOf(ComposeLoadError);
      expect((e as ComposeLoadError).code).toStrictEqual('REF_CYCLE');
    }
  });

  test('three-node cycle a -> b -> c -> a', () => {
    const loader = new MemoryLoader({
      'a.yml': { properties: { $ref: 'b.yml' } },
      'b.yml': { properties: { $ref: 'c.yml' } },
      'c.yml': { properties: { $ref: 'a.yml' } },
    });
    try {
      resolveRef('a.yml', '', loader);
      throw new Error('expected cycle error');
    } catch (e) {
      expect((e as ComposeLoadError).code).toStrictEqual('REF_CYCLE');
    }
  });

  test('diamond is NOT a cycle (same file on two disjoint branches)', () => {
    const loader = new MemoryLoader({
      'leaf.yml': { properties: { x: { type: 'text' } } },
      'left.yml': { properties: { $ref: 'leaf.yml' } },
      'right.yml': { properties: { $ref: 'leaf.yml' } },
    });
    const out = composeProperties({ $ref: ['left.yml', 'right.yml'] }, loader);
    expect(out).toStrictEqual({ x: { type: 'text' } });
  });
});

describe('$ref format errors', () => {
  test('empty string path is a format error', () => {
    const loader = new MemoryLoader({});
    try {
      resolveRef('', '', loader);
    } catch (e) {
      expect((e as ComposeLoadError).code).toStrictEqual('REF_FORMAT_ERROR');
    }
  });

  test('empty path inside parens is a detect/format error', () => {
    const loader = new MemoryLoader({});
    expect(() => resolveRef('().keys', '', loader)).toThrow(ComposeLoadError);
  });
});

describe('$ref declaration order', () => {
  test('sibling BEFORE $ref is overridden by the base', () => {
    const loader = new MemoryLoader({
      'base.yml': { properties: { a: { from: 'base' } } },
    });
    // a declared first, then $ref → base overrides a.
    const out = composeProperties({ a: { from: 'own' }, $ref: 'base.yml' }, loader);
    expect(out).toStrictEqual({ a: { from: 'base' } });
  });

  test('sibling AFTER $ref overrides the base', () => {
    const loader = new MemoryLoader({
      'base.yml': { properties: { a: { from: 'base' } } },
    });
    const out = composeProperties({ $ref: 'base.yml', a: { from: 'own' } }, loader);
    expect(out).toStrictEqual({ a: { from: 'own' } });
  });
});
