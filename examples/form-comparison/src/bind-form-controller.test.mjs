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

function input(attributes) {
  const entries = Object.entries(attributes);
  return {
    tagName: 'INPUT',
    disabled: false,
    type: attributes.type ?? 'text',
    name: attributes.name,
    value: attributes.value ?? '',
    defaultValue: attributes.value ?? '',
    checked: Object.hasOwn(attributes, 'checked'),
    getAttributeNames: () => entries.map(([name]) => name),
    getAttribute: name => entries.find(([key]) => key === name)?.[1] ?? null,
    setAttribute(name, value) {
      const entry = entries.find(([key]) => key === name);
      if (entry) entry[1] = String(value);
      else entries.push([name, String(value)]);
      if (name === 'name') this.name = String(value);
      if (name === 'value') this.defaultValue = String(value);
    },
    removeAttribute(name) {
      const index = entries.findIndex(([key]) => key === name);
      if (index >= 0) entries.splice(index, 1);
    },
  };
}

function formElement(controls) {
  const listeners = new Map();
  return {
    listeners,
    ownerDocument: { activeElement: null },
    contains: () => false,
    querySelectorAll: selector =>
      ['[name]', 'input[name],textarea[name],select[name]'].includes(selector)
        ? controls : [],
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
  };
}

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

test('external data replaces a user-edited live control value', async () => {
  const key = '__0000000000001__';
  const name = `form[companies][${key}][name]`;
  const control = input({ name, type: 'text', value: 'Saved' });
  const element = formElement([control]);
  const mount = () => ({
    load(next) {
      control.setAttribute('value', next.companies[key].name);
    },
    dispose() {},
  });
  const controller = bindFormController(element, mount, template, 'en', {
    companies: { [key]: { name: 'Saved' } },
  });
  control.value = 'Dirty value';
  await controller.load({ companies: { [key]: { name: 'Reloaded' } } });
  assert.equal(control.defaultValue, 'Reloaded');
  assert.equal(control.value, 'Reloaded');
  await controller.dispose();
});

test('checkbox restoration retains its initial attribute order', async () => {
  const key = '__0000000000001__';
  const name = `form[companies][${key}][enabled]`;
  const control = input({
    class: 'valid-target', id: 'enabled', type: 'checkbox', value: '1',
    checked: '', name,
  });
  const initialOrder = control.getAttributeNames();
  const element = formElement([control]);
  const checkboxTemplate = {
    fields: [{
      name: 'companies', spec: { type: 'group', multiple: true },
      children: [{ name: 'enabled', spec: { type: 'checkbox' }, children: [] }],
    }],
  };
  const mount = () => ({
    load(next) {
      const enabled = next.companies[key].enabled === '1';
      if (enabled) control.setAttribute('checked', '');
      else control.removeAttribute('checked');
      control.checked = enabled;
    },
    dispose() {},
  });
  const controller = bindFormController(element, mount, checkboxTemplate, 'en', {
    companies: { [key]: { enabled: '1' } },
  });
  await controller.load({ companies: { [key]: { enabled: '' } } });
  await controller.load({ companies: { [key]: { enabled: '1' } } });
  assert.deepEqual(control.getAttributeNames(), initialOrder);
  assert.equal(control.checked, true);
  await controller.dispose();
});
