import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sourceIdentity } from './source-tree.mjs';

function git(root, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
    '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
}

function temporary(t, prefix) {
  const directory = mkdtempSync(path.join(realpathSync(tmpdir()), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function repository(t) {
  const root = temporary(t, 'crudui-source-tree-');
  git(root, 'init', '--quiet');
  writeFileSync(path.join(root, 'a.txt'), 'one\n');
  mkdirSync(path.join(root, 'lib'));
  writeFileSync(path.join(root, 'lib/b.txt'), 'two\n');
  writeFileSync(path.join(root, '.gitignore'), 'ignored/\n*.log\n');
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '--message', 'initial');
  return root;
}

test('identifies a clean tree by its commit alone', async t => {
  const root = repository(t);
  const identity = await sourceIdentity(root);
  assert.deepEqual(identity, { commit: git(root, 'rev-parse', 'HEAD').trim(), changes: null });
});

test('digests uncommitted content, untracked files and deletions', async t => {
  const root = repository(t);
  const clean = await sourceIdentity(root);
  writeFileSync(path.join(root, 'a.txt'), 'changed\n');
  const changed = await sourceIdentity(root);
  assert.equal(changed.commit, clean.commit);
  assert.match(changed.changes, /^[0-9a-f]{64}$/);
  assert.deepEqual(await sourceIdentity(root), changed, 'the same content has the same identity');
  writeFileSync(path.join(root, 'a.txt'), 'changed again\n');
  assert.notEqual((await sourceIdentity(root)).changes, changed.changes);
  writeFileSync(path.join(root, 'a.txt'), 'one\n');
  assert.deepEqual(await sourceIdentity(root), clean);

  writeFileSync(path.join(root, 'new.txt'), 'new\n');
  assert.notEqual((await sourceIdentity(root)).changes, null);
  unlinkSync(path.join(root, 'new.txt'));
  mkdirSync(path.join(root, 'ignored'));
  writeFileSync(path.join(root, 'ignored/output.txt'), 'output\n');
  writeFileSync(path.join(root, 'build.log'), 'log\n');
  assert.deepEqual(await sourceIdentity(root), clean, 'ignored files are not source');

  unlinkSync(path.join(root, 'lib/b.txt'));
  assert.notEqual((await sourceIdentity(root)).changes, null);
});

test('excludes operator-local editor settings from the source tree', async t => {
  const root = repository(t);
  mkdirSync(path.join(root, '.claude'));
  writeFileSync(path.join(root, '.claude/settings.local.json'), '{"local":true}\n');
  assert.deepEqual(await sourceIdentity(root), {
    commit: git(root, 'rev-parse', 'HEAD').trim(), changes: null,
  });
});
