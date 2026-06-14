/**
 * legacy→CRUDUI translator unit tests — internal invariants not covered by the shared
 * fixture replay (which proves cross-language output). These pin the translator
 * contract directly.
 */

import { describe, test, expect } from 'vitest';
import {
  translateFromLegacy,
  translateToLegacy,
  roundtripLegacy,
  deepEqual,
  KEY_MAPPINGS,
} from './index';

describe('translator does not mutate its input', () => {
  test('the legacy object is untouched after translation', () => {
    const legacy = {
      type: 'text',
      class: 'c',
      rules: { required: true },
      onchange: 'f()',
      xnote: 'comment',
    };
    const snapshot = JSON.parse(JSON.stringify(legacy));
    translateFromLegacy(legacy);
    expect(legacy).toStrictEqual(snapshot);
  });
});

describe('x{key} comments are stripped, never emitted', () => {
  test('every x-prefixed key is dropped and logged', () => {
    const { schema, notes } = translateFromLegacy({
      type: 'text',
      class: 'keep',
      xclass: 'old',
      xstyle: 's',
      xanything: 1,
    });
    expect(schema).toStrictEqual({ type: 'text', design: { class: 'keep' } });
    expect(notes.every((n) => n.reason === 'XKEY_STRIP')).toBe(true);
    expect(notes.length).toBe(3);
    // The bare key `x` (length 1) is NOT a comment — it goes to options.
    const { schema: restored } = translateFromLegacy({ type: 'text', x: 5 });
    expect((restored.options as Record<string, unknown>).x).toBe(5);
  });
});

describe('empty slots are omitted (minimal clean output)', () => {
  test('a bare field emits only type', () => {
    const { schema } = translateFromLegacy({ type: 'text' });
    expect(schema).toStrictEqual({ type: 'text' });
  });
});

describe('input_class + class merge into one main-node class', () => {
  test('both legacy class keys fold into design.class', () => {
    const { schema } = translateFromLegacy({ type: 'text', class: 'form-control', input_class: 'x' });
    expect(schema.design).toStrictEqual({ class: 'form-control x' });
  });
});

describe('display_switch source key never survives', () => {
  test('the source field loses display_switch entirely; targets gain design.show', () => {
    const { schema } = translateFromLegacy({
      type: 'group',
      properties: {
        flag: { type: 'choice', display_switch: { 1: ['shown'] } },
        shown: { type: 'text' },
      },
    });
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect('display_switch' in props.flag).toBe(false);
    expect(props.shown.design).toStrictEqual({ show: { '.flag==1': true, true: false } });
  });
});

describe('KEY_MAPPINGS table integrity', () => {
  test('every irreversible mapping carries a reason; every reversible one omits it', () => {
    for (const m of KEY_MAPPINGS) {
      if (m.reversible) expect(m.reason, `${m.legacy} reversible but has a reason`).toBeUndefined();
      else expect(m.reason, `${m.legacy} irreversible but lacks a reason`).toBeDefined();
    }
  });
  test('the table is non-empty and lists both polarities', () => {
    expect(KEY_MAPPINGS.some((m) => m.reversible)).toBe(true);
    expect(KEY_MAPPINGS.some((m) => !m.reversible)).toBe(true);
  });
});

describe('roundtripLegacy helper reports the gate correctly', () => {
  test('a reversible spec is lossless and reversible', () => {
    const r = roundtripLegacy({ type: 'text', rules: { required: true, minlength: 3 } });
    expect(r.reversible).toBe(true);
    expect(r.lossless).toBe(true);
  });
  test('an irreversible spec is flagged out-of-gate', () => {
    const r = roundtripLegacy({ type: 'text', xclass: 'old' });
    expect(r.reversible).toBe(false);
    expect(r.notes.length).toBeGreaterThan(0);
  });
});

describe('deepEqual is order-independent on keys, strict on values', () => {
  test('reordered keys are equal; differing values are not', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe('reverse translator inverts the canonical constructs', () => {
  test('validate → rules, behavior → on*, lang → legacy', () => {
    const back = translateToLegacy({
      type: 'text',
      validate: { required: true },
      behavior: { onchange: 'f()' },
      lang: { mode: 'append', only: ['ko'] },
    });
    expect(back).toStrictEqual({
      type: 'text',
      rules: { required: true },
      onchange: 'f()',
      lang: 'append',
      langs: ['ko'],
    });
  });
});
