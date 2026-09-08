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

let checked = 0;
for (const [multiple, expected] of [
  [{ min: 0, max: 3 }, true],
  [{ min: 'one' }, false],
]) {
  const spec = { type: 'group', properties: { rows: { type: 'text', multiple } } };
  assert.equal(validateForm(spec), expected, `multiple: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
for (const test of read('../tests/fixtures/list-validity/cases.json')) {
  assert.equal(validateList(test.spec), test.expect === 'ok', `${test.name}: ${JSON.stringify(validateList.errors)}`);
  checked++;
}
for (const test of read('../tests/fixtures/translate/cases.json')) {
  assert.equal(validateForm(test.schema), true, `${test.name}: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
process.stdout.write(`[schema] form and list schema compiled; ${checked} fixture checks passed\n`);
