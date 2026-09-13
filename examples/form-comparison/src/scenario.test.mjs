import assert from 'node:assert/strict';
import test from 'node:test';

import { specFor } from './scenario.mjs';

test('returns an independent current browser form specification', () => {
  const first = specFor();
  const second = specFor();
  assert.notEqual(first, second);
  assert.notEqual(first.properties.companies, second.properties.companies);
  first.properties.companies.label.en = 'Changed';
  assert.equal(second.properties.companies.label.en, 'Companies');

  const companies = second.properties.companies;
  const stores = companies.properties.stores;
  const departments = stores.properties.departments;
  assert.deepEqual(companies.multiple, { copy: true, sortable: true, max: 4, header: 'sticky', title: 'name' });
  assert.deepEqual(stores.multiple, { copy: true, sortable: true, max: 4, header: 'sticky', title: 'name' });
  assert.deepEqual(departments.multiple, { header: 'sticky', title: 'name' });
  assert.equal(companies.properties.name.validate.required, true);
  assert.equal(stores.properties.name.validate.required, true);
  assert.equal(stores.properties.detail.design.show, '.enabled');
});
