/**
 * utils/dataAttributes Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateUniqid,
  resetUniqid,
  toBracketNotation,
  toBracketNotationWithPrefix,
  toRuleNameNotation,
  getLimepieDataAttributes,
} from '../utils/dataAttributes';
import { isUniqueKey, extractUniqueKeys } from '../utils/path';

describe('generateUniqid', () => {
  beforeEach(() => {
    resetUniqid();
  });

  it('emits __ + 13 hex chars + __ (PHP uniqid() length)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUniqid()).toMatch(/^__[0-9a-f]{13}__$/);
    }
  });

  it('is deterministic: same sequence after reset (SSR/hydration parity)', () => {
    const serverPass = [generateUniqid(), generateUniqid(), generateUniqid()];
    resetUniqid();
    const clientPass = [generateUniqid(), generateUniqid(), generateUniqid()];
    expect(clientPass).toEqual(serverPass);
  });

  it('never repeats within a pass', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateUniqid());
    }
    expect(seen.size).toBe(1000);
  });

  it('matches the {13} pattern used by isUniqueKey/extractUniqueKeys', () => {
    const id = generateUniqid();
    expect(isUniqueKey(id)).toBe(true);
    expect(extractUniqueKeys(`items[${id}].name`)).toEqual([id]);
  });
});

describe('toBracketNotationWithPrefix (canonical)', () => {
  it('converts dot notation without prefix', () => {
    expect(toBracketNotationWithPrefix('common.email')).toBe('common[email]');
    expect(toBracketNotationWithPrefix('user.address.city')).toBe('user[address][city]');
    expect(toBracketNotationWithPrefix('name')).toBe('name');
    expect(toBracketNotationWithPrefix('')).toBe('');
  });

  it('handles existing bracket segments', () => {
    expect(toBracketNotationWithPrefix('items[0].name')).toBe('items[0][name]');
  });

  it('prepends the key prefix as root segment', () => {
    expect(toBracketNotationWithPrefix('basic.name', 'product')).toBe('product[basic][name]');
    expect(toBracketNotationWithPrefix('name', 'product')).toBe('product[name]');
    expect(toBracketNotationWithPrefix('items[0].name', 'product')).toBe('product[items][0][name]');
  });
});

describe('toBracketNotation (deprecated wrapper)', () => {
  it('delegates to toBracketNotationWithPrefix for all inputs', () => {
    const inputs = ['', 'name', 'common.email', 'user.address.city', 'items[0].name', 'a[__abcdefghijklm__].b'];
    for (const input of inputs) {
      expect(toBracketNotation(input)).toBe(toBracketNotationWithPrefix(input));
    }
  });
});

describe('toRuleNameNotation', () => {
  it('converts dot paths and passes single segments through', () => {
    expect(toRuleNameNotation('basic.name')).toBe('basic[name]');
    expect(toRuleNameNotation('name')).toBe('name');
  });
});

describe('getLimepieDataAttributes', () => {
  it('emits data-rule-name, data-name, data-default', () => {
    const attrs = getLimepieDataAttributes({ type: 'text', default: 'x' }, 'basic.name');
    expect(attrs['data-rule-name']).toBe('basic[name]');
    expect(attrs['data-name']).toBe('name');
    expect(attrs['data-default']).toBe('x');
  });

  it('emits empty data-default when no default is set', () => {
    const attrs = getLimepieDataAttributes({ type: 'text' }, 'name');
    expect(attrs['data-default']).toBe('');
  });
});
