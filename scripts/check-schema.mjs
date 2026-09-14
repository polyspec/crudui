#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const schema = read('../schema/crudui.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
const validateForm = ajv.compile(schema);
const validateList = ajv.compile({
  $schema: schema.$schema,
  definitions: schema.definitions,
  $ref: '#/definitions/List',
});
const validateDetail = ajv.compile({
  $schema: schema.$schema,
  definitions: schema.definitions,
  $ref: '#/definitions/Detail',
});

let checked = 0;
for (const [multiple, expected] of [
  [{ min: 0, max: 3 }, true],
  [{ min: 'one' }, false],
  [{ copy: true, sortable: true }, true],
  [{ copy: {} }, false],
  [{ title: 'name', controls: 'outline', header: 'sticky' }, true],
  [{ controls: 'side' }, false],
  [{ header: 'fixed' }, false],
]) {
  const spec = { type: 'group', properties: { rows: { type: 'text', multiple } } };
  assert.equal(validateForm(spec), expected, `multiple: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
for (const [extra, expected] of [
  [{ buttons: [{ type: 'submit', name: '__submitted__', value: 'go', text: { ko: '저장', en: 'Save' }, design: { class: 'primary' } }] }, true],
  [{ buttons: [{ type: 'reset' }, { type: 'button', text: 'Cancel', behavior: { onclick: 'history.back()' } }] }, true],
  [{ buttons: [{ type: 'link', text: 'List', href: '../' }], action: { method: 'post', url: '/save' } }, true],
  [{ buttons: [{ type: 'image' }] }, false],
  [{ buttons: [{ type: 'button' }] }, false],
  [{ buttons: [{ type: 'link', text: 'List' }] }, false],
  [{ action: { target: '_blank' } }, false],
]) {
  const spec = { type: 'group', properties: { name: { type: 'text' } }, ...extra };
  assert.equal(validateForm(spec), expected, `buttons: ${JSON.stringify(extra)} ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
for (const test of read('../tests/fixtures/list-validity/cases.json')) {
  assert.equal(validateList(test.spec), test.expect === 'ok', `${test.name}: ${JSON.stringify(validateList.errors)}`);
  checked++;
}
for (const test of read('../tests/fixtures/detail-validity/cases.json')) {
  assert.equal(validateDetail(test.spec), test.expect === 'ok', `${test.name}: ${JSON.stringify(validateDetail.errors)}`);
  checked++;
}
for (const test of read('../tests/fixtures/translate/cases.json')) {
  assert.equal(validateForm(test.schema), true, `${test.name}: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
process.stdout.write(`[schema] form, list and detail schema compiled; ${checked} fixture checks passed\n`);
