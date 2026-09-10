import assert from 'node:assert/strict';
import { fstatSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSourceArchiveCommit, serverReady, sourceArchiveReady } from './server-startup.mjs';

const commit = 'a'.repeat(40);
const archiveSha256 = 'c'.repeat(64);
const moduleSha256 = 'd'.repeat(64);
const metadata = { source: { commit, archiveSha256 }, cruduiModuleSha256: moduleSha256 };
const phpFiles = {
  'CRUDUI\\Generator': '/workspace/source/packages/generator-php/src/Generator.php',
  'CRUDUI\\Form': '/workspace/source/packages/generator-php/src/Form.php',
  'CRUDUI\\Validator': '/workspace/source/packages/validator-php/src/Public/Validator.php',
};

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
