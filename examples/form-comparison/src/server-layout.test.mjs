import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { serverRequest } from './server-layout.mjs';
import { recordViews } from './record-contract.mjs';

const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const goSource = await readFile(new URL('../servers/go/main.go', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../servers/rust/src/main.rs', import.meta.url), 'utf8');

test('every server announces its readiness line', () => {
  assert.match(serverSource, /CRUDUI_READY public/);
  assert.match(goSource, /CRUDUI_READY go/);
  assert.match(rustSource, /CRUDUI_READY rust/);
});

test('receives the build state through process events without polling in the public server', () => {
  assert.match(serverSource, /process\.on\('message'/);
  assert.equal(serverSource.includes('setTimeout'), false);
  assert.equal(serverSource.includes('setInterval'), false);
  assert.doesNotMatch(serverSource, /\/api\/source/);
  assert.doesNotMatch(serverSource, /metadata\.json|source\.tar|archiveSha256|\/opt\/|imageReference/);
});

test('uses the current public API parser and forwards the rendering path', () => {
  assert.deepEqual(serverRequest('/api/rust/save/createForm/svelte', '?language=ko'), {
    server: 'rust', path: '/api/save/createForm/svelte?language=ko',
  });
  for (const invalid of [
    '/api/rust/save/keyed/svelte',
    '/api/rust/save/original/svelte',
    '/api/rust/save/corrected/svelte',
    '/api/rust/save/original-keyed/svelte',
  ]) assert.equal(serverRequest(invalid), null);
  assert.match(serverSource, /serverRequest\(url\.pathname, url\.search\)/);
  // The record resource of every native server is forwarded; the public server is the js store.
  assert.deepEqual(serverRequest('/api/go/records', '?page=2'), { server: 'go', path: '/api/records?page=2' });
  assert.deepEqual(serverRequest('/api/php-ext/records/22'), { server: 'php-ext', path: '/api/records/22' });
  assert.deepEqual(serverRequest('/api/rust/records/reset'), { server: 'rust', path: '/api/records/reset' });
  assert.deepEqual(serverRequest('/api/php/records/view/form', '?id=22'), { server: 'php', path: '/api/records/view/form?id=22' });
  for (const invalid of ['/api/js/records/22', '/api/go/records/22/extra', '/api/go/records/view/table']) {
    assert.equal(serverRequest(invalid), null, invalid);
  }
  for (const view of recordViews) {
    assert.equal(serverRequest(`/api/go/records/view/${view}`).path, `/api/records/view/${view}`, view);
  }
  assert.match(serverSource, /benchmark-console/);
  assert.doesNotMatch(serverSource, /\/displays\//);
});
