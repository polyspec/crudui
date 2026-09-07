import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeJson, decodeJson } from './json.mjs';

const bytes = source => new TextEncoder().encode(source);

test('ordered JSON retains nested identity order, empty types and scalar values', () => {
  const source = '{"form":{"companies":{"__0000000000005__":{"stores":{}},"__abcde01234567__":{"stores":{"__0000000000007__":{"departments":{}}}},"__0000000000001__":{"stores":{}}}},"items":[{},[],false,null,1.25,"서울"]}';
  const data = decodeJson(bytes(source));
  assert.deepEqual(Object.keys(data.form.companies), ['__0000000000005__', '__abcde01234567__', '__0000000000001__']);
  assert.equal(encodeJson(data), source);
  assert.deepEqual(data.items, [{}, [], false, null, 1.25, '서울']);
  assert.equal(Object.hasOwn(decodeJson(bytes('{"__proto__":{"value":"own"}}')), '__proto__'), true);
});

test('decoding rejects changed record order, malformed UTF-8 and invalid numbers', () => {
  assert.throws(() => decodeJson(bytes('{"5":{},"7":{},"1":{}}')), /object order/);
  assert.throws(() => decodeJson(new Uint8Array([0x22, 0xff, 0x22])), /UTF-8/);
  assert.throws(() => decodeJson(bytes('{"form":{},}')));
  for (const value of ['9007199254740993', '1e400']) {
    assert.throws(() => decodeJson(bytes(value)), /number exceeds/);
  }
});

test('encoding does not silently omit unsupported values or change invalid numbers', () => {
  assert.throws(() => encodeJson({ name: undefined }), /Expected JSON form data/);
  assert.throws(() => encodeJson(new Map()), /Expected JSON form data/);
  for (const value of [NaN, Infinity, 9007199254740992]) {
    assert.throws(() => encodeJson(value), /number exceeds/);
  }
});
