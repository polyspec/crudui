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
// The structure-validity families share one case shape:
// { name, note, spec, files?, expect: "ok"|"fail", reason?, engine: "pass"|{ code, at } }.
// `expect` and `reason` are the meta-schema result for the family entry point.
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const caseKeys = new Set(['name', 'note', 'spec', 'files', 'expect', 'reason', 'engine']);
function assertValidityCase(family, test) {
  assert.ok(isObject(test), `${family}: every case is an object`);
  const label = `${family}:${test.name}`;
  for (const key of Object.keys(test)) assert.ok(caseKeys.has(key), `${label}: unknown member ${key}`);
  assert.equal(typeof test.name, 'string', `${label}: name is a string`);
  assert.equal(typeof test.note, 'string', `${label}: note is a string`);
  assert.ok(isObject(test.spec), `${label}: spec is an object`);
  if ('files' in test) assert.ok(isObject(test.files), `${label}: files is an object`);
  assert.ok(test.expect === 'ok' || test.expect === 'fail', `${label}: expect is "ok" or "fail"`);
  if (test.expect === 'fail') assert.equal(typeof test.reason, 'string', `${label}: a fail case names its reason`);
  else assert.ok(!('reason' in test), `${label}: only a fail case has a reason`);
  const engineShape =
    test.engine === 'pass' ||
    (isObject(test.engine) &&
      Object.keys(test.engine).sort().join() === 'at,code' &&
      typeof test.engine.code === 'string' &&
      typeof test.engine.at === 'string');
  assert.ok(engineShape, `${label}: engine is "pass" or { code, at }`);
}
for (const [family, validate] of [
  ['spec-validity', validateForm],
  ['list-validity', validateList],
  ['detail-validity', validateDetail],
]) {
  const cases = read(`../tests/fixtures/${family}/cases.json`);
  assert.ok(Array.isArray(cases) && cases.length > 0, `${family}: cases is a nonempty array`);
  assert.equal(new Set(cases.map((test) => test.name)).size, cases.length, `${family}: case names are unique`);
  for (const test of cases) {
    assertValidityCase(family, test);
    const label = `${family}:${test.name}`;
    assert.equal(validate(test.spec), test.expect === 'ok', `${label}: ${JSON.stringify(validate.errors)}`);
    if (test.expect === 'fail') {
      const keywords = validate.errors.map((error) => error.keyword);
      assert.ok(keywords.includes(test.reason), `${label}: expected ${test.reason} among ${JSON.stringify(keywords)}`);
    }
    checked++;
  }
}
for (const test of read('../tests/fixtures/translate/cases.json')) {
  assert.equal(validateForm(test.schema), true, `${test.name}: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
process.stdout.write(`[schema] form, list and detail schema compiled; ${checked} fixture checks passed\n`);
