// The product form examples, composed, validated and rendered through the public packages.
// Every expectation below is written from docs/spec: validation-rules.md (visibility, values,
// default messages), form-runtime.md (only-collections, hidden values) and form-markup.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import YAML from 'yaml';
import { validate } from '@crudui/validator';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';

const directory = import.meta.dirname;
const yaml = name => YAML.parse(readFileSync(path.join(directory, name), 'utf8'));
const json = name => JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
const files = { 'option-row.yml': yaml('option-row.yml'), 'option-form.yml': yaml('option-form.yml') };
const optionForm = yaml('option-form.yml');
const productForm = yaml('product-form.yml');

const required = (path, value) => ({ path, field: path.split('.').pop(), rule: 'required', message: 'This field is required.', value });
const error = (path, rule, message, value) => ({ path, field: path.split('.').pop(), rule, message, value });
const generated = 'options.combined.generated';

/** The five errors of option-invalid.json: rows are traversed in sorted key order. */
const optionErrors = [
  required(`${generated}.__opt_a1__.price`, ''),
  required(`${generated}.__opt_b2__.name`, ''),
  error(`${generated}.__opt_c3__.price`, 'min', 'Please enter a value greater than or equal to 1.', 0.5),
  error(`${generated}.__opt_c3__.stock`, 'digits', 'Please enter only digits.', '2.5'),
  error(`${generated}.__opt_c3__.sku`, 'pattern', 'Please enter a valid format.', 'blue'),
];

test('option form: hidden sections skip their rules and visible combination rows are valid', () => {
  assert.deepEqual(validate(optionForm, json('option-valid.json'), { files }), { valid: true, errors: [] });
});

test('option form: every combination row is validated under its data key', () => {
  assert.deepEqual(validate(optionForm, json('option-invalid.json'), { files }), { valid: false, errors: optionErrors });
});

test('option form: switching the option type hides and shows the kept combination values', () => {
  const data = json('option-invalid.json');
  data.options.mode = 'single';
  assert.deepEqual(validate(optionForm, data, { files }), { valid: true, errors: [] });
  data.options.mode = 'combined';
  assert.deepEqual(validate(optionForm, data, { files }), { valid: false, errors: optionErrors });
});

test('option form: missing combination data is zero rows and fails only the count rule', () => {
  const data = { options: { mode: 'combined', combined: { axes: json('option-valid.json').options.combined.axes } } };
  assert.deepEqual(validate(optionForm, data, { files }), {
    valid: false,
    errors: [error(generated, 'mincount', 'Please select at least 1 items.', null)],
  });
});

test('product form: hidden sections, rows and nested groups skip their rules', () => {
  assert.deepEqual(validate(productForm, json('product-valid.json'), { files }), { valid: true, errors: [] });
});

test('product form: visible fields report their first error in declaration order', () => {
  assert.deepEqual(validate(productForm, json('product-invalid.json'), { files }), {
    valid: false,
    errors: [
      required('basics.name', ''),
      error('basics.code', 'pattern', 'Please enter a valid format.', 'PRD-42'),
      error('visibility.schedule.end', 'enddate', 'End date must be after the start date.', '2026-10-01'),
      error('pricing.discount_value', 'max', 'Please enter a value less than or equal to 100.', 150),
      ...optionErrors,
      required('shipping.fee', null),
      error('shipping.returns.days', 'range', 'Please enter a value between 1 and 90.', 120),
      required('shipping.returns.address.line1', ''),
      error('shipping.returns.address.postal_code', 'pattern', 'Please enter a valid format.', '123'),
      error('seo.slug', 'pattern', 'Please enter a valid format.', 'Canvas Tote'),
    ],
  });
});

/** Render a form and return its document and helpers. */
function render(spec, data) {
  const form = createForm(compileForm(spec, { files }), data, { idPrefix: 'product', language: 'en' });
  const { document } = new JSDOM(`<form>${renderForm(form)}</form>`).window;
  const node = fieldPath => [...document.querySelectorAll('[data-field-path]')].find(item => item.getAttribute('data-field-path') === fieldPath);
  const rows = fieldPath => [...node(fieldPath).querySelectorAll('[data-crudui-row-key]')]
    .filter(row => row.parentElement.closest('[data-field-path]') === node(fieldPath));
  const actions = fieldPath => [...node(fieldPath).querySelectorAll('[data-crudui-action]')].map(button => button.getAttribute('data-crudui-action'));
  const control = (fieldPath, suffix) => [...node(fieldPath).querySelectorAll('[name]')].find(item => item.getAttribute('name').endsWith(suffix));
  return { form, document, node, rows, actions, control };
}

test('option form: combination rows render in data order under their keys without row controls', () => {
  const { form, node, rows, actions, control } = render(optionForm, json('option-invalid.json'));
  assert.deepEqual(rows(generated).map(row => row.getAttribute('data-crudui-row-key')), ['__opt_c3__', '__opt_a1__', '__opt_b2__']);
  assert.deepEqual(actions(generated).filter(action => action !== 'toggle-row'), []);
  assert.equal(control(generated, '[generated][__opt_a1__][name]').value, 'Red / Small');
  // The free-form collection is an ordinary repeated group and keeps its controls.
  assert.ok(actions('options.free').includes('add-row'));
  // Hidden sections keep their values.
  assert.equal(node('options.single').hasAttribute('hidden'), true);
  assert.equal(node('options.combined').hasAttribute('hidden'), false);
  assert.equal(control('options.single', '[single][name]').value, 'Only');
  assert.equal(form.getData().options.single.name, 'Only');
  assert.deepEqual(Object.keys(form.getData().options.combined.generated), ['__opt_c3__', '__opt_a1__', '__opt_b2__']);
});

test('option form: missing combination data renders a header and an empty body without an add control', () => {
  const { form, node, rows, actions } = render(optionForm, { options: { mode: 'combined' } });
  const collection = node(generated);
  assert.deepEqual(rows(generated), []);
  assert.deepEqual(actions(generated), []);
  assert.ok(collection.querySelector(':scope > .crudui-node__header'));
  const body = collection.querySelector(':scope > .crudui-node__body');
  assert.ok(body);
  assert.equal(body.children.length, 0);
  assert.deepEqual(Object.keys(form.getData().options?.combined?.generated ?? {}), []);
});

test('option form: row operations on combination rows fail and change nothing', () => {
  const { form } = render(optionForm, json('option-invalid.json'));
  const before = JSON.stringify(form.getData());
  const message = { code: 'INVALID_FORM_INPUT', message: `Rows of ${generated} come only from data` };
  assert.throws(() => form.addRow(generated), message);
  assert.throws(() => form.copyRow(generated, '__opt_a1__'), message);
  assert.throws(() => form.removeRow(generated, '__opt_a1__'), message);
  assert.throws(() => form.moveRow(generated, '__opt_a1__', 0), message);
  assert.throws(() => form.rekeyRow(generated, '__opt_a1__', '__opt_d4__'), message);
  assert.equal(JSON.stringify(form.getData()), before);
});

test('product form: composed sections render with hidden fields keeping their values', () => {
  const { node, rows, actions, control } = render(productForm, json('product-valid.json'));
  assert.deepEqual(rows('shipping.regions').map(row => row.getAttribute('data-crudui-row-key')), ['__region_north__', '__region_south__']);
  assert.deepEqual(actions('shipping.regions').filter(action => action !== 'toggle-row'), []);
  assert.deepEqual(rows('options.combined.generated').map(row => row.getAttribute('data-crudui-row-key')), ['__opt_b2__', '__opt_a1__']);
  assert.ok(actions('attributes').includes('copy-row'));
  assert.equal(node('shipping.fee').hasAttribute('hidden'), true);
  assert.equal(control('shipping.fee', '[fee]').value, '-1');
  assert.equal(node('shipping.returns.address').hasAttribute('hidden'), true);
  assert.equal(control('shipping.returns.address', '[postal_code]').value, 'x');
  assert.equal(node('shipping.rates').hasAttribute('hidden'), false);
  assert.equal(node('options.free').hasAttribute('hidden'), true);
});
