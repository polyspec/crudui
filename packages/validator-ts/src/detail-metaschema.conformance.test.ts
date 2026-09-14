import { describe, expect, test } from 'vitest';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDetail } from './validate-detail';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/crudui.schema.json'), 'utf8'));

function validator() {
  return new Ajv({ strict: false, allErrors: true }).compile({
    $schema: schema.$schema,
    definitions: schema.definitions,
    $ref: '#/definitions/Detail',
  });
}

describe('detail meta-schema and structure validation', () => {
  test('accepts ordered display fields and rejects input-only declarations', () => {
    const validate = validator();
    expect(validate({ fields: { name: { field: '.name', label: 'Name', format: 'text' } } })).toBe(true);
    expect(validate({ fields: { name: { field: '.name', sortable: true } } })).toBe(false);
  });

  test('uses shared composition and forbidden-key validation', () => {
    expect(validateDetail({ fields: { $ref: 'shared.json' } }, {
      files: { 'shared.json': { properties: { name: { field: '.name' } } } },
    })).toEqual({ valid: true, errors: [] });
    expect(() => validateDetail({ fields: { name: { field: '.name', show_if: true } } })).toThrow();
  });
});
