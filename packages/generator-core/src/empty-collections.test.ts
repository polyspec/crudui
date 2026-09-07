import { describe, expect, test } from 'vitest';
import { buildForm } from './index';

const group = { type: 'group', multiple: true, properties: { name: { type: 'text' } } };
const scalar = { type: 'text', multiple: true };

function rows(field: Record<string, unknown>, data: Record<string, unknown>) {
  return buildForm({ properties: { items: field } }, { data })[0]!.rows!;
}

describe('explicit empty collections', () => {
  for (const [name, field] of Object.entries({ group, scalar })) {
    test(`${name}: empty arrays and objects have no rows`, () => {
      expect(rows(field, { items: [] })).toEqual([]);
      expect(rows(field, { items: {} })).toEqual([]);
    });
    test(`${name}: missing data still creates an initial row`, () => {
      expect(rows(field, {})).toHaveLength(1);
    });
  }
  test('visibility does not create or remove collection data', () => {
    const field = { ...group, design: { show: '.visible' } };
    const spec = { properties: { items: field } };
    for (const items of [{}, { __0000000000005__: { name: 'Five' } }]) {
      for (const visible of [false, true]) {
        const data = { items, visible };
        const before = structuredClone(data);
        const vm = buildForm(spec, { data })[0]!;
        expect(vm.design.show).toBe(visible);
        expect(vm.rows).toHaveLength(Object.keys(items).length);
        expect(data).toEqual(before);
      }
    }
  });
  test('nested empty collections preserve sibling identity and order', () => {
    const field = { ...group, properties: { name: { type: 'text' }, children: group } };
    const data = { items: {
      __0000000000005__: { name: 'Five', children: {} },
      __0000000000007__: { name: 'Seven', children: { __0000000000001__: { name: 'Child' } } },
      __0000000000001__: { name: 'One', children: [] },
    } };
    const before = structuredClone(data);
    const output = rows(field, data);
    expect(output.map(row => row.uniqid)).toEqual(Object.keys(data.items));
    expect(output.map(row => row.children![1]!.rows!.length)).toEqual([0, 1, 0]);
    expect(output[1]!.children![1]!.rows![0]!.uniqid).toBe('__0000000000001__');
    expect(data).toEqual(before);
  });
});
