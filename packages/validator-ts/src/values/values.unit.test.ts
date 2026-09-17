/**
 * Value definitions (validation-rules.md, "Values").
 */

import { describe, test, expect } from 'vitest';
import { canonicalText, codePointLength, isEmptyValue, isMember, readMembers, trim } from './index';

describe('values', () => {
  test('trimming removes White_Space only', () => {
    expect(trim('\u0085\u3000 a\u00a0\ufeff\u2029')).toBe('a\u00a0\ufeff');
    expect(trim('\u200b\u180e')).toBe('\u200b\u180e');
  });
  test('emptiness', () => {
    expect([undefined, null, '', '\u2000', [], {}].every(isEmptyValue)).toBe(true);
    expect([0, false, '\u0000', '\ufeff', [null], { a: undefined }].some(isEmptyValue)).toBe(false);
  });
  test('canonical text', () => {
    expect([true, false, -0, 1e21, 1e-7, 0.000001, 100].map(canonicalText)).toEqual(['1', '0', '0', '1e+21', '1e-7', '0.000001', '100']);
    expect([NaN, Infinity, [], {}, null].map(canonicalText)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
  test('length counts code points of the canonical text', () => {
    expect([' \u{1f600} ', 1.5, true, ['a'], { a: 1 }].map(codePointLength)).toEqual([3, 3, 1, undefined, undefined]);
  });
  test('membership', () => {
    const members = readMembers('+1., .5 ,x');
    if ('error' in members) throw new Error(members.error);
    expect(['1', 1, '0.50', 0.5, ' x ', true, '1e0', 'X', ['x', 1], ['x', null]].map((value) => isMember(value, members.members))).toEqual([
      true, true, true, true, true, false, false, false, true, true,
    ]);
    expect([['x', ' '], [undefined], [[], {}], [['x']], [{ a: 'x' }]].map((value) => isMember(value, members.members))).toEqual([
      true, true, true, false, false,
    ]);
    expect(readMembers([null, ' '])).toEqual({ error: 'Invalid in parameter: members must be strings, numbers or booleans' });
    expect(readMembers([' ', null])).toEqual({ error: 'Invalid in parameter: members must not be empty' });
    expect(readMembers(['a', Infinity])).toEqual({ error: 'Invalid in parameter: members must be strings, numbers or booleans' });
    expect(readMembers({ ' ': 'blank' })).toEqual({ error: 'Invalid in parameter: members must not be empty' });
  });
});
