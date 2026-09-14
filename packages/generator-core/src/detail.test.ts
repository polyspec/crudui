import { describe, expect, test } from 'vitest';
import { buildDetail } from './detail';

describe('buildDetail', () => {
  test('builds ordered read-only fields through the list display engine', () => {
    const vm = buildDetail({
      fields: {
        name: { field: '.name', label: { en: 'Name', ko: '이름' } },
        state: { field: '.state', format: { type: 'badge', map: { active: 'success' } } },
      },
    }, { name: 'Ada', state: 'active' }, { language: 'en' });

    expect(vm.fields.map((field) => field.key)).toEqual(['name', 'state']);
    expect(vm.fields[0]?.display).toBe('Ada');
    expect(vm.fields[1]?.display).toEqual({ kind: 'badge', variant: 'success', label: 'active' });
  });

  test('resolves composed detail fields', () => {
    const vm = buildDetail({ fields: { $ref: 'shared.json' } }, { name: 'Ada' }, {
      files: { 'shared.json': { properties: { name: { field: '.name' } } } },
    });
    expect(vm.fields[0]?.display).toBe('Ada');
  });
});
