/**
 * utils/path Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parsePathString,
  pathToString,
  getValueByPath,
  setValueByPath,
  generateUniqueKey,
  isUniqueKey,
  extractUniqueKeys,
  keysToIndices,
} from '../utils/path';
import type { FormData } from '../types';

describe('setValueByPath', () => {
  it('returns a new object without mutating the input', () => {
    const original: FormData = { a: { b: 1 } } as unknown as FormData;
    const result = setValueByPath(original, 'a.b', 2);

    expect(result).not.toBe(original);
    expect(getValueByPath(result, 'a.b')).toBe(2);
    expect(getValueByPath(original, 'a.b')).toBe(1);
  });

  it('creates intermediate containers', () => {
    const result = setValueByPath({}, 'x.y.z', 'v');
    expect(getValueByPath(result, 'x.y.z')).toBe('v');
  });
});

describe('keysToIndices', () => {
  it('returns a non-empty result for plain data (regression: accumulator was discarded)', () => {
    const result = keysToIndices({ name: 'kim', age: 3 });
    expect(result).toEqual({ name: 'kim', age: 3 });
  });

  it('converts unique keys to sequential indices (numeric segments become arrays)', () => {
    const result = keysToIndices({
      items: {
        __abcdefghijklm__: { name: 'first' },
        __zyxwvutsrqpon__: { name: 'second' },
      },
    } as unknown as FormData);

    expect(result).toEqual({
      items: [{ name: 'first' }, { name: 'second' }],
    });
  });

  it('keeps regular nested objects and arrays intact', () => {
    const result = keysToIndices({
      profile: { bio: 'hello', tags: ['a', 'b'] },
    } as unknown as FormData);

    expect(result).toEqual({
      profile: { bio: 'hello', tags: ['a', 'b'] },
    });
  });

  it('skips null and undefined leaves', () => {
    const result = keysToIndices({
      a: null,
      b: undefined,
      c: 'keep',
    } as unknown as FormData);

    expect(result).toEqual({ c: 'keep' });
  });

  it('handles mixed unique-key and regular keys in one object', () => {
    const result = keysToIndices({
      group: {
        __abcdefghijklm__: 'item',
        label: 'fixed',
      },
    } as unknown as FormData);

    expect(getValueByPath(result, 'group[0]')).toBe('item');
    expect(getValueByPath(result, 'group.label')).toBe('fixed');
  });
});

describe('generateUniqueKey / isUniqueKey / extractUniqueKeys', () => {
  it('generateUniqueKey output satisfies isUniqueKey', () => {
    for (let i = 0; i < 20; i++) {
      const key = generateUniqueKey();
      expect(isUniqueKey(key)).toBe(true);
      expect(key).toMatch(/^__[a-z0-9]{13}__$/);
    }
  });

  it('extractUniqueKeys finds generated keys inside a path', () => {
    const key = generateUniqueKey();
    const keys = extractUniqueKeys(`items[${key}].name`);
    expect(keys).toEqual([key]);
  });
});

describe('parsePathString / pathToString round trip', () => {
  it('round-trips bracket and dot notation', () => {
    expect(parsePathString('a[0].b')).toEqual(['a', '0', 'b']);
    expect(pathToString(['a', '0', 'b'])).toBe('a[0].b');
  });
});
