import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  binaryDirectory, buildDirectory, cacheDirectory, cruduiModule, dataDirectory,
  orderedJsonDirectory, orderedJsonModule, publicDirectory, publicServerProcess,
  resultsDirectory, serverProcess, serverRequest, sourceIdentityFile, sourceMount,
  treeDirectory,
} from './server-layout.mjs';
import { formServers } from './runtime-paths.mjs';

const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const supervisorSource = await readFile(new URL('../supervisor.mjs', import.meta.url), 'utf8');
const goSource = await readFile(new URL('../servers/go/main.go', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../servers/rust/src/main.rs', import.meta.url), 'utf8');
const moduleSha256 = 'b'.repeat(64);

test('reads the mounted repository and writes builds only to container volumes', () => {
  assert.equal(sourceMount, '/workspace/source');
  assert.equal(buildDirectory, '/workspace/build');
  assert.equal(cacheDirectory, '/workspace/cache');
  assert.equal(treeDirectory, '/workspace/build/tree');
  assert.equal(publicDirectory, '/workspace/build/public');
  assert.equal(binaryDirectory, '/workspace/build/bin');
  assert.equal(sourceIdentityFile, '/workspace/build/public/source.json');
  assert.equal(orderedJsonDirectory, '/workspace/build/tree/.form-comparison/sources/ordered-json');
  assert.equal(cruduiModule, '/workspace/build/tree/packages/php-ext/modules/crudui.so');
  assert.equal(orderedJsonModule,
    '/workspace/build/tree/.form-comparison/sources/ordered-json/php-extension/src/modules/ordered_json.so');
  assert.equal(dataDirectory, '/data');
  assert.equal(resultsDirectory, '/results');
  for (const file of [publicDirectory, binaryDirectory, cruduiModule, orderedJsonModule]) {
    assert.equal(file.startsWith(sourceMount + '/'), false, file);
  }
});

test('starts one process for each server implementation from the build volume', () => {
  const processes = formServers.map(server => serverProcess(server, { cruduiModuleSha256: moduleSha256 }));
  assert.deepEqual(processes.map(process => process.server), ['php', 'php-ext', 'go', 'rust']);
  const [php, phpExtension, go, rust] = processes;
  for (const process of [php, phpExtension]) {
    assert.equal(process.command, 'php');
    assert.equal(process.args.at(-1), '/workspace/build/tree/examples/form-comparison/api.php');
    assert.equal(process.environment.FORM_ORDERED_JSON_PHP_SOURCE,
      `${orderedJsonDirectory}/php/src/OrderedJson.php`);
  }
  assert.equal(php.args.some(value => value.startsWith('extension=')), false);
  assert.equal(Object.hasOwn(php.environment, 'FORM_CRUDUI_MODULE_SHA256'), false);
  assert.deepEqual(phpExtension.args.slice(0, 4),
    ['-d', `extension=${orderedJsonModule}`, '-d', `extension=${cruduiModule}`]);
  assert.equal(phpExtension.environment.FORM_CRUDUI_MODULE_SHA256, moduleSha256);
  assert.equal(go.command, '/workspace/build/bin/go');
  assert.equal(rust.command, '/workspace/build/bin/rust');
  for (const process of [go, rust]) {
    assert.deepEqual(process.args.slice(1), [dataDirectory, publicDirectory, sourceIdentityFile]);
  }
  for (const process of processes) {
    assert.equal(process.args.includes(publicDirectory), true);
    assert.equal(process.args.some(value => /\/opt\/|\/archives\/|metadata\.json/.test(value)), false);
    assert.equal(process.ready.pattern.test(process.ready.example), true);
  }
  assert.throws(() => serverProcess('php-ext'), /requires the built module digest/);
  assert.throws(() => serverProcess('node'), /Unknown server/);
});

test('runs the public server from the build tree with an event readiness line', () => {
  const definition = publicServerProcess();
  assert.equal(definition.command, process.execPath);
  assert.deepEqual(definition.args, ['/workspace/build/tree/examples/form-comparison/server.mjs']);
  assert.equal(definition.ready.pattern.test(definition.ready.example), true);
  assert.equal(definition.environment.CRUDUI_CROSS_CHECK_GO_VALIDATOR,
    '/workspace/build/bin/validator-go');
  assert.equal(definition.environment.CRUDUI_CROSS_CHECK_RUST_VALIDATOR,
    '/workspace/build/bin/validator-rust');
  assert.match(serverSource, /CRUDUI_READY public/);
  assert.match(goSource, /CRUDUI_READY go/);
  assert.match(rustSource, /CRUDUI_READY rust/);
});

test('publishes build state through process events without polling in the public server', () => {
  assert.match(serverSource, /process\.on\('message'/);
  assert.equal(serverSource.includes('setTimeout'), false);
  assert.equal(serverSource.includes('setInterval'), false);
  assert.match(serverSource, /\/api\/source/);
  assert.match(supervisorSource, /waitForChildReadiness/);
  assert.match(supervisorSource, /verifyChildServers/);
  assert.doesNotMatch(supervisorSource + serverSource,
    /metadata\.json|source\.tar|archiveSha256|\/opt\/|imageReference/);
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
  assert.match(serverSource, /serverRequest\(url\.pathname, url\.search\)/);
  assert.match(serverSource, /benchmark-console/);
  assert.doesNotMatch(serverSource, /\/displays\//);
});
