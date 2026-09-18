import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { phpClassFiles } from './php-provenance.mjs';
import { treeDirectory } from './server-layout.mjs';
import { serverReady, stopChild, verifyChildServers, waitForChildReadiness } from './server-startup.mjs';

const source = { commit: 'a'.repeat(40), changes: 'c'.repeat(64) };
const moduleSha256 = 'd'.repeat(64);
const expected = { source, cruduiModuleSha256: moduleSha256 };
const phpFiles = phpClassFiles(treeDirectory);

function phpHealth(server) {
  const native = server === 'php-ext';
  return {
    status: 'ok',
    server,
    nativeJson: native,
    generator: {
      runtime: server,
      source: { ...source },
      nativeCRUDUI: native,
      moduleSha256: native ? moduleSha256 : null,
      composerAutoload: !native,
      classes: Object.fromEntries(Object.entries(phpFiles).map(([name, file]) => [name, {
        internal: native,
        extension: native ? 'crudui' : null,
        file: native ? null : file,
      }])),
      signatures: Object.fromEntries(Object.keys(phpFiles).map(name => [name, { method: { static: true, parameters: [], return: 'string' } }])),
    },
  };
}
const expectedSignatures = phpHealth('php').generator.signatures;

function compiledHealth(server, identity = source) {
  return { status: 'ok', server, source: { ...identity } };
}

test('accepts current Composer and native PHP implementations', () => {
  assert.equal(serverReady('php', true, phpHealth('php'), expected, expectedSignatures), true);
  assert.equal(serverReady('php-ext', true, phpHealth('php-ext'), expected, expectedSignatures), true);
});

test('rejects the repository validator source in PHP health', () => {
  const value = phpHealth('php');
  value.generator.classes['CRUDUI\\Validator'].file =
    '/workspace/build/tree/packages/validator-php/src/Public/Validator.php';
  assert.equal(serverReady('php', true, value, expected, expectedSignatures), false);
});

test('rejects incomplete or inconsistent PHP provenance', () => {
  for (const mutate of [
    value => { value.generator.runtime = 'php-ext'; },
    value => { value.generator.source.commit = 'b'.repeat(40); },
    value => { value.generator.source.changes = null; },
    value => { delete value.generator.source; },
    value => { value.generator.source = { changes: source.changes, commit: source.commit }; },
    value => { value.generator.nativeCRUDUI = true; },
    value => { value.generator.moduleSha256 = moduleSha256; },
    value => { value.generator.composerAutoload = false; },
    value => { delete value.generator.classes['CRUDUI\\Form']; },
    value => { value.generator.classes['CRUDUI\\Generator'].file = '/workspace/source/packages/generator-php/src/Generator.php'; },
  ]) {
    const value = phpHealth('php');
    mutate(value);
    assert.equal(serverReady('php', true, value, expected, expectedSignatures), false);
  }
  const native = phpHealth('php-ext');
  native.generator.classes['CRUDUI\\Validator'].internal = false;
  assert.equal(serverReady('php-ext', true, native, expected, expectedSignatures), false);
  for (const mutate of [
    value => { value.generator.moduleSha256 = '0'.repeat(64); },
    value => { value.generator.source.commit = 'b'.repeat(40); },
    value => { value.generator.composerAutoload = true; },
    value => { delete value.generator.signatures['CRUDUI\\Form']; },
  ]) {
    const value = phpHealth('php-ext');
    mutate(value);
    assert.equal(serverReady('php-ext', true, value, expected, expectedSignatures), false);
  }
  const signatures = phpHealth('php-ext');
  signatures.generator.signatures['CRUDUI\\Generator'].method.return = 'int';
  assert.equal(serverReady('php-ext', true, signatures, expected, expectedSignatures), false);
  assert.equal(serverReady('php-ext', true, phpHealth('php-ext'), expected), false);
});

test('checks compiled servers against the published source identity', () => {
  assert.equal(serverReady('go', true, compiledHealth('go'), expected), true);
  assert.equal(serverReady('rust', true, compiledHealth('rust'), expected), true);
  assert.equal(serverReady('go', true,
    compiledHealth('go', { commit: 'b'.repeat(40), changes: source.changes }), expected), false);
  assert.equal(serverReady('rust', true,
    compiledHealth('rust', { commit: source.commit, changes: null }), expected), false);
  assert.equal(serverReady('go', true, { status: 'ok', server: 'go', commit: source.commit }, expected), false);
  assert.equal(serverReady('rust', false, compiledHealth('rust'), expected), false);
});

test('receives one fragmented child readiness event without polling', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  const ready = waitForChildReadiness(child, {
    server: 'go', stream: 'stderr', pattern: /(?:^|\n)CRUDUI_READY go(?:\n|$)/,
  });
  child.stderr.write('CRUDUI_');
  child.stderr.write('READY go\n');
  assert.equal(await ready, 'go');
});

test('fails when a child exits before publishing readiness', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  const ready = waitForChildReadiness(child, {
    server: 'rust', stream: 'stderr', pattern: /CRUDUI_READY rust/,
  });
  child.emit('exit', 2, null);
  await assert.rejects(ready, /rust exited before readiness: 2/);
});

test('requests each API server once in matrix order', async () => {
  const requests = [];
  await verifyChildServers({
    expected,
    request: async url => {
      requests.push(url);
      const server = ['php', 'php-ext', 'go', 'rust'][requests.length - 1];
      return {
        ok: true,
        json: async () => server.startsWith('php') ? phpHealth(server) : compiledHealth(server),
      };
    },
  });
  assert.deepEqual(requests, [
    'http://127.0.0.1:8081/api/health',
    'http://127.0.0.1:8088/api/health',
    'http://127.0.0.1:8082/api/health',
    'http://127.0.0.1:8085/api/health',
  ]);
});

test('rejects one invalid child response without another request', async () => {
  const requests = [];
  await assert.rejects(verifyChildServers({
    expected,
    request: async url => {
      requests.push(url);
      return { ok: true, json: async () => ({ status: 'invalid' }) };
    },
  }), /php failed startup verification: status/);
  assert.deepEqual(requests, ['http://127.0.0.1:8081/api/health']);
});

test('names the first differing field of a stale server', async () => {
  await assert.rejects(verifyChildServers({
    expected,
    request: async url => ({
      ok: true,
      json: async () => {
        const server = { 8081: 'php', 8088: 'php-ext', 8082: 'go', 8085: 'rust' }[new URL(url).port];
        return server === 'go'
          ? compiledHealth('go', { commit: source.commit, changes: null })
          : server.startsWith('php') ? phpHealth(server) : compiledHealth(server);
      },
    }),
  }), /go failed startup verification: source/);
});

function silentChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

test('fails a child that publishes no readiness within its limit', async () => {
  const started = performance.now();
  await assert.rejects(waitForChildReadiness(silentChild(), {
    server: 'go', stream: 'stderr', pattern: /CRUDUI_READY go/,
  }, 50), /go published no readiness within 50ms/);
  assert.ok(performance.now() - started < 1_000);
});

test('fails a health request that does not answer within its limit', async () => {
  const started = performance.now();
  // The request answers only when its signal aborts it.
  const hung = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  });
  await assert.rejects(verifyChildServers({ expected, request: hung, limitMs: 50 }),
    /php health request failed within 50ms/);
  assert.ok(performance.now() - started < 1_000);
});

test('stops a child that ignores SIGTERM with SIGKILL after the grace period', async t => {
  const child = spawn(process.execPath, ['-e',
    "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"],
  { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await new Promise(resolve => child.stdout.once('data', resolve));
  const started = performance.now();
  await stopChild(child, 100);
  assert.equal(child.signalCode, 'SIGKILL');
  assert.ok(performance.now() - started < 2_000, `stopped after ${performance.now() - started} ms`);
});
