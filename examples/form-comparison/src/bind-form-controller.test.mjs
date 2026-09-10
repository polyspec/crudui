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

test('accepts saved, unsaved and empty keyed collections', async () => {
  const renders = [];
  const listeners = new Map();
  const element = {
    ownerDocument: { activeElement: null },
    contains: () => false,
    querySelectorAll: () => [],
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
  };
  const mount = (_element, _template, language, data) => {
    assert.equal(language, 'ko');
    renders.push(structuredClone(data));
    return {
      load(next) { renders.push(structuredClone(next)); },
      dispose() {},
    };
  };
  const initial = {
    companies: {
      __0000000000001__: { name: 'Saved' },
      __00000000000af__: { name: 'New' },
    },
  };
  const controller = bindFormController(element, mount, template, 'ko', initial);
  assert.deepEqual(controller.getData(), initial);
  assert.equal(listeners.size, 4);
  await controller.load({ companies: {} });
  assert.deepEqual(controller.getData(), { companies: {} });
  assert.deepEqual(renders, [initial, { companies: {} }]);
  await controller.dispose();
  assert.equal(listeners.size, 0);
});
