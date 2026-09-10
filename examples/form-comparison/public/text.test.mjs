import assert from 'node:assert/strict';
import test from 'node:test';

import { translations } from './text.mjs';

test('provides the same browser verification fields in English and Korean', () => {
  const english = translations('en');
  const korean = translations('ko');
  assert.deepEqual(Object.keys(english).sort(), Object.keys(korean).sort());
  assert.deepEqual(Object.keys(english.serverNames).sort(),
    ['go', 'php', 'php-ext', 'rust']);
  assert.deepEqual(Object.keys(korean.serverNames).sort(),
    Object.keys(english.serverNames).sort());
  for (const text of [english, korean]) {
    assert.equal(text.bindForm, 'bindForm');
    assert.equal(text.createForm, 'createForm');
    assert.match(text.intro, /bindForm/);
    assert.match(text.intro, /createForm/);
    assert.ok(text.formTransport);
    assert.ok(text.jsonTransport);
  }
});

test('uses Korean for an unspecified browser language', () => {
  assert.equal(translations('other'), translations('ko'));
});
