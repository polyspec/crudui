import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  binaryDirectory, buildDirectory, cacheDirectory, cruduiModule, dataDirectory,
  orderedJsonDirectory, orderedJsonModule, publicDirectory, publicServerProcess,
  resultsDirectory, serverProcess, serverRequest, sourceIdentityFile, sourceMount,
  treeDirectory,
} from './server-layout.mjs';
import { recordViews } from './record-contract.mjs';
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
  for (const [index, server] of [[0, 'php'], [1, 'php-ext']]) {
    const process = [php, phpExtension][index];
    // PHP-FPM behind nginx, started by the PHP server program with its address and run directory.
    assert.equal(process.command, globalThis.process.execPath);
    assert.deepEqual(process.args.slice(0, 4), ['/workspace/build/tree/examples/form-comparison/servers/php/main.mjs',
      `127.0.0.1:${index === 0 ? 8081 : 8088}`, `/workspace/build/state/php-${server}`, '--']);
    assert.deepEqual(process.ready.pattern, new RegExp(`^CRUDUI_READY ${server}$`, 'm'));
    assert.equal(process.environment.FORM_ORDERED_JSON_PHP_SOURCE,
      `${orderedJsonDirectory}/php/src/OrderedJson.php`);
    // The record store and the fixture are located by the process, not by constants in api.php.
    assert.equal(process.environment.FORM_DATA_DIRECTORY, dataDirectory);
    assert.equal(process.environment.FORM_PUBLIC_DIRECTORY, publicDirectory);
  }
  assert.equal(php.args.some(value => value.startsWith('extension=')), false);
  assert.equal(Object.hasOwn(php.environment, 'FORM_CRUDUI_MODULE_SHA256'), false);
  assert.deepEqual(phpExtension.args.slice(4, 8),
    ['-d', `extension=${orderedJsonModule}`, '-d', `extension=${cruduiModule}`]);
  assert.equal(phpExtension.environment.FORM_CRUDUI_MODULE_SHA256, moduleSha256);
  assert.equal(go.command, '/workspace/build/bin/go');
  assert.equal(rust.command, '/workspace/build/bin/rust');
  for (const process of [go, rust]) {
    assert.deepEqual(process.args.slice(1), [dataDirectory, publicDirectory, sourceIdentityFile]);
  }
  for (const process of [go, rust]) assert.equal(process.args.includes(publicDirectory), true);
  for (const process of processes) {
    assert.equal(process.args.some(value => /\/opt\/|\/archives\/|metadata\.json/.test(value)), false);
    assert.equal(process.ready.pattern.test(process.ready.example), true);
  }
  assert.throws(() => serverProcess('php-ext'), /requires the built module digest/);
  assert.throws(() => serverProcess('node'), /Unknown server/);
});

test('runs the public server from the build tree with an event readiness line', () => {
  const definition = publicServerProcess();
  assert.equal(definition.command, process.execPath);
  assert.deepEqual(definition.args, ['/workspace/build/tree/examples/form-comparison/server.mjs',
    '0.0.0.0:8080', dataDirectory, publicDirectory, JSON.stringify({ php: 8081, 'php-ext': 8088, go: 8082, rust: 8085 })]);
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
  // The build state is read from the supervisor's state file, which exists before the public server can start.
  assert.doesNotMatch(serverSource, /\/api\/source/);
  assert.match(supervisorSource, /renameSync\(temporary, buildStateFile\)/);
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
  // The record resource of every native server is forwarded; the public server is the js store.
  assert.deepEqual(serverRequest('/api/go/records', '?page=2'), { server: 'go', port: 8082, path: '/api/records?page=2' });
  assert.deepEqual(serverRequest('/api/php-ext/records/22'), { server: 'php-ext', port: 8088, path: '/api/records/22' });
  assert.deepEqual(serverRequest('/api/rust/records/reset'), { server: 'rust', port: 8085, path: '/api/records/reset' });
  assert.deepEqual(serverRequest('/api/php/records/view/form', '?id=22'), { server: 'php', port: 8081, path: '/api/records/view/form?id=22' });
  for (const invalid of ['/api/js/records/22', '/api/go/records/22/extra', '/api/go/records/view/table']) {
    assert.equal(serverRequest(invalid), null, invalid);
  }
  for (const view of recordViews) {
    assert.equal(serverRequest(`/api/go/records/view/${view}`).path, `/api/records/view/${view}`, view);
  }
  assert.match(serverSource, /benchmark-console/);
  assert.doesNotMatch(serverSource, /\/displays\//);
});

test('reloads the supervisor in its own process so the container keeps running', () => {
  // The supervisor is the only child of the container's init process; if it exited, the container
  // would stop. A reload replaces the process image and keeps its process id.
  const reload = supervisorSource.slice(supervisorSource.indexOf('async function reloadSupervisor'),
    supervisorSource.indexOf('async function watchSource'));
  assert.match(reload, /process\.execve\(process\.execPath, \[process\.execPath,\s/);
  assert.doesNotMatch(reload, /process\.exit\(|spawn\(|detached/);
});
