import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fstatSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { phpClassFiles } from './php-provenance.mjs';
import { sourceDirectory } from './server-layout.mjs';
import {
  publishCandidateReadiness, readinessOutput, readSourceArchiveCommit, serverReady,
  sourceArchiveReady,
  verifyChildServers, waitForChildReadiness,
} from './server-startup.mjs';

const commit = 'a'.repeat(40);
const archiveSha256 = 'c'.repeat(64);
const moduleSha256 = 'd'.repeat(64);
const metadata = { source: { commit, archiveSha256 }, cruduiModuleSha256: moduleSha256 };
const phpFiles = phpClassFiles(sourceDirectory);

function phpHealth(server) {
  const native = server === 'php-ext';
  return {
    status: 'ok',
    server,
    nativeJson: native,
    generator: {
      runtime: server,
      commit,
      archiveSha256,
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

test('passes the source archive to Git through a file descriptor', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'crudui-source-archive-'));
  const archive = path.join(temporary, 'source.tar');
  const content = Buffer.alloc(2 * 1024 * 1024, 1);
  writeFileSync(archive, content);
  let descriptor;
  try {
    const actual = readSourceArchiveCommit(archive, (command, args, options) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['get-tar-commit-id']);
      assert.equal(Object.hasOwn(options, 'input'), false);
      descriptor = options.stdio[0];
      assert.equal(fstatSync(descriptor).size, content.length);
      return { error: undefined, signal: null, status: 0, stdout: `${commit}\n`, stderr: '' };
    });
    assert.equal(actual, commit);
    assert.throws(() => fstatSync(descriptor), { code: 'EBADF' });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('requires source metadata to match the deployed Git archive', () => {
  assert.equal(sourceArchiveReady(metadata, archiveSha256, commit), true);
  assert.equal(sourceArchiveReady(metadata, '0'.repeat(64), commit), false);
  assert.equal(sourceArchiveReady(metadata, archiveSha256, '0'.repeat(40)), false);
});

test('accepts current Composer and native PHP implementations', () => {
  assert.equal(serverReady('php', true, phpHealth('php'), metadata, expectedSignatures), true);
  assert.equal(serverReady('php-ext', true, phpHealth('php-ext'), metadata, expectedSignatures), true);
});

test('rejects the repository validator source in PHP health', () => {
  const value = phpHealth('php');
  value.generator.classes['CRUDUI\\Validator'].file =
    '/workspace/source/packages/validator-php/src/Public/Validator.php';
  assert.equal(serverReady('php', true, value, metadata, expectedSignatures), false);
});

test('rejects incomplete or inconsistent PHP provenance', () => {
  for (const mutate of [
    value => { value.generator.runtime = 'php-ext'; },
    value => { value.generator.commit = 'c'.repeat(40); },
    value => { value.generator.archiveSha256 = '0'.repeat(64); },
    value => { value.generator.nativeCRUDUI = true; },
    value => { value.generator.moduleSha256 = moduleSha256; },
    value => { value.generator.composerAutoload = false; },
    value => { delete value.generator.classes['CRUDUI\\Form']; },
    value => { value.generator.classes['CRUDUI\\Generator'].file = '/tmp/Generator.php'; },
  ]) {
    const value = phpHealth('php');
    mutate(value);
    assert.equal(serverReady('php', true, value, metadata, expectedSignatures), false);
  }
  const native = phpHealth('php-ext');
  native.generator.classes['CRUDUI\\Validator'].internal = false;
  assert.equal(serverReady('php-ext', true, native, metadata, expectedSignatures), false);
  for (const mutate of [
    value => { value.generator.moduleSha256 = '0'.repeat(64); },
    value => { value.generator.archiveSha256 = '0'.repeat(64); },
    value => { value.generator.composerAutoload = true; },
    value => { delete value.generator.signatures['CRUDUI\\Form']; },
  ]) {
    const value = phpHealth('php-ext');
    mutate(value);
    assert.equal(serverReady('php-ext', true, value, metadata, expectedSignatures), false);
  }
  const signatures = phpHealth('php-ext');
  signatures.generator.signatures['CRUDUI\\Generator'].method.return = 'int';
  assert.equal(serverReady('php-ext', true, signatures, metadata, expectedSignatures), false);
  assert.equal(serverReady('php-ext', true, phpHealth('php-ext'), metadata), false);
});

test('checks compiled servers against the candidate source commit', () => {
  assert.equal(serverReady('go', true, { status: 'ok', server: 'go', commit }, metadata), true);
  assert.equal(serverReady('rust', true, { status: 'ok', server: 'rust', commit }, metadata), true);
  assert.equal(serverReady('go', true, { status: 'ok', server: 'go', commit: 'b'.repeat(40) }, metadata), false);
  assert.equal(serverReady('rust', false, { status: 'ok', server: 'rust', commit }, metadata), false);
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

test('requests each child once after every readiness event', async () => {
  const resolvers = [];
  const readiness = ['php', 'php-ext', 'go', 'rust'].map(server =>
    new Promise(resolve => resolvers.push(() => resolve(server))));
  const requests = [];
  const verification = verifyChildServers({
    readiness,
    servers: ['php', 'php-ext', 'go', 'rust'],
    ports: { php: 8081, 'php-ext': 8088, go: 8082, rust: 8085 },
    metadata,
    request: async url => {
      requests.push(url);
      const server = ['php', 'php-ext', 'go', 'rust'][requests.length - 1];
      return {
        ok: true,
        json: async () => server.startsWith('php')
          ? phpHealth(server) : { status: 'ok', server, commit },
      };
    },
  });
  for (const resolve of resolvers.slice(0, -1)) resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, []);
  resolvers.at(-1)();
  await verification;
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
    readiness: ['php', 'php-ext', 'go', 'rust'],
    servers: ['php', 'php-ext', 'go', 'rust'],
    ports: { php: 8081, 'php-ext': 8088, go: 8082, rust: 8085 },
    metadata,
    request: async url => {
      requests.push(url);
      return { ok: true, json: async () => ({ status: 'invalid' }) };
    },
  }), /php failed startup verification: status/);
  assert.deepEqual(requests, ['http://127.0.0.1:8081/api/health']);
});

test('requires one declared readiness output mode', () => {
  assert.equal(readinessOutput({ FORM_COMPARISON_READINESS: 'service' }), null);
  assert.equal(readinessOutput({
    FORM_COMPARISON_READINESS: 'file',
    FORM_COMPARISON_READY_FILE: '/results/candidate-ready.json',
  }), '/results/candidate-ready.json');
  assert.throws(() => readinessOutput({}),
    /FORM_COMPARISON_READINESS must be service or file/);
  assert.throws(() => readinessOutput({
    FORM_COMPARISON_READINESS: 'file', FORM_COMPARISON_READY_FILE: 'ready.json',
  }), /Candidate readiness path must be absolute/);
  assert.throws(() => readinessOutput({
    FORM_COMPARISON_READINESS: 'service',
    FORM_COMPARISON_READY_FILE: '/results/candidate-ready.json',
  }), /Service readiness must not declare a candidate readiness file/);
});

test('publishes one complete readiness file and rejects existing paths', async t => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'crudui-ready-'));
  t.after(() => import('node:fs/promises').then(({ rm }) =>
    rm(root, { recursive: true, force: true })));
  const file = path.join(root, 'candidate-ready.json');
  const value = { commit, servers: ['php', 'php-ext', 'go', 'rust'] };
  await publishCandidateReadiness(file, value);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), value);
  await assert.rejects(publishCandidateReadiness(file, value),
    /readiness path already exists/);
  const occupied = path.join(root, 'occupied-ready.json');
  await writeFile(occupied, 'existing\n');
  await assert.rejects(publishCandidateReadiness(occupied, value),
    /readiness path already exists/);
});
