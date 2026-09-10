import assert from 'node:assert/strict';
import test from 'node:test';

import { bindFormController } from './bind-form-controller.mjs';

const template = {
  fields: [{
    name: 'companies',
    spec: { type: 'group', multiple: true },
    children: [{ name: 'name', spec: { type: 'text' }, children: [] }],
  }],
};

test('rejects row keys outside the current keyed data contract', () => {
  for (const key of [
    'company',
    '__000000000000A__',
    '__000000000001__',
    '__00000000000000__',
    '__000000000000g__',
    '__proto__',
  ]) {
    const data = { companies: Object.fromEntries([[key, { name: 'Invalid' }]]) };
    assert.throws(
      () => bindFormController({}, () => { throw new Error('mount called'); }, template, 'en', data),
      /Invalid row key/,
      key,
    );
  }
});
