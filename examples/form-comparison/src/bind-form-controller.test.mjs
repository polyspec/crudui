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

// A window for row tracking; fake forms have no rows to measure.
const fakeWindow = {
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  getComputedStyle: () => ({}),
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
    ownerDocument: { activeElement: null, defaultView: fakeWindow, documentElement: { clientHeight: 0 } },
    style: { setProperty() {} },
    contains: () => false,
    querySelector: () => null,
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

test('rejects data with the wrong shape at its full data path', () => {
  const key = '__0000000000001__';
  const nestedTemplate = {
    fields: [
      { name: 'address', spec: { type: 'group' }, children: [{ name: 'city', spec: { type: 'text' }, children: [] }] },
      {
        name: 'companies', spec: { type: 'group', multiple: true },
        children: [{ name: 'stores', spec: { type: 'group', multiple: true }, children: [] }],
      },
    ],
  };
  for (const [data, message] of [
    [null, 'Form data must be an object'],
    [{ address: 'Seoul' }, 'Group data must be an object: address'],
    [{ companies: [] }, 'Repeated data must be a keyed object: companies'],
    [{ companies: { [key]: 'One' } }, `Group data must be an object: companies.${key}`],
    [{ companies: { [key]: { stores: [] } } }, `Repeated data must be a keyed object: companies.${key}.stores`],
  ]) {
    assert.throws(
      () => bindFormController({}, () => { throw new Error('mount called'); }, nestedTemplate, 'en', data),
      { name: 'TypeError', message },
    );
  }
});

test('accepts saved, unsaved and empty keyed collections', async () => {
  const renders = [];
  const listeners = new Map();
  const element = {
    ownerDocument: { activeElement: null, defaultView: fakeWindow, documentElement: { clientHeight: 0 } },
    style: { setProperty() {} },
    contains: () => false,
    querySelector: () => null,
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
  assert.deepEqual([...listeners.keys()], ['input', 'change', 'click']);
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

test('row operations focus the affected row after rendering', async () => {
  const { JSDOM } = await import('jsdom');
  const { window } = new JSDOM('<form><div id="view"></div></form>');
  const { document } = window;
  const element = document.querySelector('#view');
  const actions = ['move-up', 'add-row', 'copy-row', 'remove-row'];
  const rowHtml = ([key, row]) => `<div class="crudui-node crudui-node--row" data-crudui-row-key="${key}">`
    + `<div class="crudui-node__header">${actions.map(action =>
      `<button type="button" data-crudui-action="${action}"></button>`).join('')}</div>`
    + `<div class="crudui-node__body"><input name="form[companies][${key}][name]" value="${row.name ?? ''}"></div></div>`;
  const mount = (target, _template, _language, data) => {
    const render = next => {
      const rows = Object.entries(next.companies);
      target.innerHTML = '<div class="crudui-node crudui-node--collection" data-field-path="companies">'
        + `<div class="crudui-node__body">${rows.map(rowHtml).join('')}</div>`
        + (rows.length ? '' : '<div class="crudui-node__footer"><button type="button" data-crudui-action="add-row"></button></div>')
        + '</div>';
    };
    render(data);
    return { load: render, dispose() {} };
  };
  const [k1, k2, k3] = ['__0000000000001__', '__0000000000002__', '__0000000000003__'];
  const controller = bindFormController(element, mount, template, 'en', {
    companies: { [k1]: { name: 'A' }, [k2]: { name: 'B' }, [k3]: { name: 'C' } },
  });
  const keys = () => Object.keys(controller.getData().companies);
  const focusedKey = () => document.activeElement.closest('[data-crudui-row-key]')
    ?.getAttribute('data-crudui-row-key');
  async function act(key, action) {
    const button = key === undefined
      ? document.querySelector('.crudui-node__footer [data-crudui-action="add-row"]')
      : document.querySelector(`[data-crudui-row-key="${key}"] [data-crudui-action="${action}"]`);
    button.focus();
    button.click();
    await controller.idle();
  }

  document.querySelector(`input[name="form[companies][${k1}][name]"]`).focus();
  await act(k1, 'add-row');
  const added = keys()[1];
  assert.equal(focusedKey(), added, 'adding focuses the new row');
  assert.equal(document.activeElement.tagName, 'INPUT', 'the new row focus is its first input');
  await act(k3, 'copy-row');
  assert.equal(focusedKey(), keys().at(-1), 'copying focuses the copied row');
  await act(k2, 'move-up');
  assert.deepEqual(keys().slice(0, 3), [k1, k2, added]);
  assert.equal(focusedKey(), k2, 'moving focuses the moved row');
  await act(k2, 'remove-row');
  assert.equal(focusedKey(), k1, 'removing focuses the previous row');
  await act(k1, 'remove-row');
  assert.equal(focusedKey(), added, 'removing the first row focuses the next row');
  while (keys().length > 1) await act(keys()[0], 'remove-row');
  await act(keys()[0], 'remove-row');
  assert.equal(document.activeElement.matches('[data-crudui-action="add-row"]'), true,
    'removing the last row focuses the collection Add button');
  await act(undefined, 'add-row');
  assert.equal(focusedKey(), keys()[0], 'adding into an empty collection focuses the new row');
  await controller.dispose();
});

test('view state, history and focus retention match a createForm instance', async () => {
  const { JSDOM } = await import('jsdom');
  const { bindForm, compileForm, createForm } = await import('@crudui/generator-core');
  const { window } = new JSDOM('<div id="view"></div>');
  const { document } = window;
  const element = document.querySelector('#view');
  const compiled = compileForm({ type: 'group', properties: {
    companies: { type: 'group', multiple: true, properties: { name: { type: 'text' } } },
  } }, { keyPrefix: 'form' });
  const [k1, k2] = ['__0000000000001__', '__0000000000002__'];
  const initial = { companies: { [k1]: { name: 'Sales' }, [k2]: { name: '' } } };
  const mount = (target, template, language, data) => {
    const load = (next, view = { collapsed: new Set() }) => {
      const [companies] = bindForm(template, next, { language, collapsed: view.collapsed });
      target.innerHTML = '<div data-field-path="companies"><div class="crudui-node__body">'
        + companies.children.map(row => `<div data-crudui-row-key="${row.key}">`
          + `<div class="crudui-node__header"><button type="button" data-crudui-action="toggle-row" aria-expanded="${row.expanded}"></button>`
          + '<button type="button" data-crudui-action="remove-row"></button></div>'
          + `<div class="crudui-node__body"${row.expanded ? '' : ' hidden'}>`
          + `<input name="form[companies][${row.key}][name]" value="${next.companies[row.key].name}"></div></div>`).join('')
        + '</div></div>';
    };
    load(data);
    return { load, dispose() {} };
  };
  const controller = bindFormController(element, mount, compiled, 'en', initial);
  const session = createForm(compiled, initial, { language: 'en' });
  function same(label) {
    const snapshot = session.getSnapshot();
    assert.deepEqual(controller.getData(), session.getData(), `${label}: data`);
    assert.deepEqual(
      Array.from(element.querySelectorAll('[data-crudui-action="toggle-row"]'), button => button.getAttribute('aria-expanded')),
      snapshot.fields[0].children.map(row => String(row.expanded)), `${label}: expanded rows`);
    assert.equal(controller.getView().canUndo, snapshot.canUndo, `${label}: undo availability`);
  }
  async function type(key, value) {
    const input = element.querySelector(`input[name="form[companies][${key}][name]"]`);
    input.focus();
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await controller.idle();
    session.setValue(`companies.${key}.name`, value);  }
  async function press(key, action) {
    const button = element.querySelector(`[data-crudui-row-key="${key}"] [data-crudui-action="${action}"]`);
    button.focus();
    button.click();
    await controller.idle();
    return button;
  }
  same('initial');
  await type(k1, 'S');
  await type(k1, 'Sa');
  await type(k2, 'Ops');
  same('edits');
  const toggled = await press(k1, 'toggle-row');
  session.toggleRow('companies', k1);
  same('toggle');
  assert.notEqual(document.activeElement, toggled, 'rendering replaced the toggle button');
  assert.equal(document.activeElement.getAttribute('data-crudui-action'), 'toggle-row');
  assert.equal(document.activeElement.closest('[data-crudui-row-key]').getAttribute('data-crudui-row-key'), k1,
    'toggling keeps focus on the same action button');
  await controller.setAllExpanded(false);
  session.setAllExpanded(false);
  same('collapse all');
  await controller.setAllExpanded(true);
  session.setAllExpanded(true);
  same('expand all');
  await controller.toggleRow('companies', k2);
  session.toggleRow('companies', k2);  same('toggle second');
  await press(k2, 'remove-row');
  session.removeRow('companies', k2);
  // Focus moved to the previous row's input.
  assert.equal(document.activeElement.name, `form[companies][${k1}][name]`);  same('remove');
  for (const step of ['undo remove', 'undo second edit', 'undo merged edits']) {
    await controller.undo();
    session.undo();    same(step);
  }
  assert.equal(controller.getView().canUndo, false);
  assert.throws(() => controller.undo(), /Nothing to undo/);
  await controller.toggleRow('companies', k1);
  session.toggleRow('companies', k1);
  await controller.load(initial);
  session.setData(initial);  same('replace record');
  await controller.dispose();
});
