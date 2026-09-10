import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { archiveRepositorySource, readRepositorySourceFile } from './source-archive.mjs';

function git(repository, ...args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

function createRepository(t) {
  const repository = mkdtempSync(path.join(tmpdir(), 'crudui-source-'));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'CRUDUI Test');
  git(repository, 'config', 'user.email', 'test@crudui.invalid');
  mkdirSync(path.join(repository, 'examples/form-comparison'), { recursive: true });
  mkdirSync(path.join(repository, 'packages/generator-core'), { recursive: true });
  writeFileSync(path.join(repository, 'examples/form-comparison/Containerfile'),
    'FROM scratch\n');
  writeFileSync(path.join(repository, 'packages/generator-core/index.ts'),
    'export const generator = true;\n');
  writeFileSync(path.join(repository, 'package.json'), '{"private":true}\n');
  git(repository, 'add', '.');
  git(repository, 'commit', '--quiet', '-m', 'Create source');
  return repository;
}

test('archives the complete selected repository commit', t => {
  const repository = createRepository(t);
  const source = archiveRepositorySource(repository, 'HEAD');

  assert.equal(source.commit, git(repository, 'rev-parse', 'HEAD'));
  assert.match(source.archiveSha256, /^[0-9a-f]{64}$/);
  const entries = execFileSync('tar', ['-tf', '-'], {
    input: source.archive, encoding: 'utf8',
  }).trim().split('\n');
  assert.ok(entries.includes('examples/form-comparison/Containerfile'));
  assert.ok(entries.includes('packages/generator-core/index.ts'));
  assert.ok(entries.includes('package.json'));
  assert.ok(entries.every(entry => !entry.startsWith('.git/')));
  assert.equal(
    readRepositorySourceFile(repository, source.commit,
      'examples/form-comparison/Containerfile').toString(),
    'FROM scratch\n',
  );
});

test('rejects tracked and untracked source changes', t => {
  const repository = createRepository(t);
  writeFileSync(path.join(repository, 'package.json'), '{"private":false}\n');
  assert.throws(() => archiveRepositorySource(repository, 'HEAD'),
    /repository contains tracked or untracked changes/);

  git(repository, 'restore', 'package.json');
  writeFileSync(path.join(repository, 'untracked.txt'), 'not committed\n');
  assert.throws(() => archiveRepositorySource(repository, 'HEAD'),
    /repository contains tracked or untracked changes/);
});

test('rejects a missing source commit', t => {
  const repository = createRepository(t);
  assert.throws(() => archiveRepositorySource(repository, 'missing-source-ref'),
    /Cannot resolve source commit/);
});
