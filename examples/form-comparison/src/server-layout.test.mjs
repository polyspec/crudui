import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  orderedJsonDirectory, publicDirectory, serverProcesses, serverRequest,
  sourceArchiveFile, sourceDirectory,
} from './server-layout.mjs';

const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('uses the candidate source archive and extracted source directory', () => {
  assert.equal(sourceArchiveFile, '/archives/source.tar');
  assert.equal(sourceDirectory, '/workspace/source');
  assert.equal(orderedJsonDirectory,
    '/workspace/source/.form-comparison/sources/ordered-json');
  assert.equal(publicDirectory, '/workspace/public');
});

test('starts one current process for each server implementation', () => {
  const processes = serverProcesses('a'.repeat(64), 'b'.repeat(64));
  assert.deepEqual(processes.map(process => process.server),
    ['php', 'php-ext', 'go', 'rust']);
  assert.equal(processes.filter(process => process.command === 'php').length, 2);
  for (const process of processes.filter(process => process.command === 'php')) {
    assert.equal(process.environment.FORM_ORDERED_JSON_PHP_SOURCE,
      `${orderedJsonDirectory}/php/src/OrderedJson.php`);
  }
  assert.equal(processes.find(process => process.server === 'go').command,
    '/workspace/bin/go');
  assert.equal(processes.find(process => process.server === 'rust').command,
    '/workspace/bin/rust');
  for (const process of processes) {
    assert.equal(process.args.includes('/workspace/public'), true);
    assert.equal(process.args.some(value => /original|corrected|keyed/.test(value)), false);
  }
});

test('uses the current public API parser and forwards the rendering path', () => {
  assert.deepEqual(serverRequest('/api/rust/save/createForm/svelte', '?language=ko'), {
    server: 'rust', port: 8085, path: '/api/save/createForm/svelte?language=ko',
  });
  for (const invalid of [
    '/api/rust/save/keyed/svelte',
    '/api/rust/save/original/svelte',
    '/api/rust/save/corrected/svelte',
    '/api/rust/save/original-keyed/svelte',
  ]) assert.equal(serverRequest(invalid), null);
});

test('connects the current layout to the executable server', () => {
  assert.match(serverSource, /serverRequest\(url\.pathname, url\.search\)/);
  assert.match(serverSource, /serverProcesses\(archiveSha256, cruduiModuleSha256\)/);
  assert.match(serverSource, /readFile\(sourceArchiveFile\)/);
  assert.doesNotMatch(serverSource, /corrected|original-keyed|\/workspace\/keyed|\/archives\/keyed\.tar/);
});
