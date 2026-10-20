import assert from 'node:assert/strict';
import test from 'node:test';

import { checkedShape, shapeOf } from './json-schema.mts';

const shape = shapeOf<{ name: string; files: { path: string }[] }>({
  type: 'object',
  required: ['name', 'files'],
  properties: {
    name: { type: 'string' },
    files: { type: 'array', items: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } },
  },
});

test('a value of the shape is returned as it is', () => {
  const value = { name: 'crudui', files: [{ path: 'a' }] };
  assert.equal(checkedShape(shape, value, 'manifest.json'), value);
});

test('a refused value names its file and the JSON Pointer of the wrong value', () => {
  assert.throws(
    () => checkedShape(shape, { name: 'crudui', files: [{ path: 3 }] }, 'manifest.json'),
    /^Error: manifest\.json: at \/files\/0\/path: must be string$/,
  );
  assert.throws(
    () => checkedShape(shape, [], 'manifest.json'),
    /^Error: manifest\.json: must be object$/,
  );
});
