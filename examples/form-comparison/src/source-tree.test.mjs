import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertSourceIdentity } from './source-identity.mjs';
import {
  applyTreeChanges, changedPaths, readTreeState, sourceIdentity, synchronizeTree,
} from './source-tree.mjs';

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
  assert.equal(assertSourceIdentity(identity), identity);
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

test('excludes operator-local Claude settings from the source tree', async t => {
  const root = repository(t);
  mkdirSync(path.join(root, '.claude'));
  writeFileSync(path.join(root, '.claude/settings.local.json'), '{"local":true}\n');
  assert.deepEqual(await sourceIdentity(root), {
    commit: git(root, 'rev-parse', 'HEAD').trim(), changes: null,
  });
});

test('detects edits, repeated edits, commits, additions and removals', async t => {
  const root = repository(t);
  const initial = await readTreeState(root);
  assert.deepEqual(await changedPaths(root, initial, await readTreeState(root)), []);

  writeFileSync(path.join(root, 'a.txt'), 'edited\n');
  const edited = await readTreeState(root);
  assert.deepEqual(await changedPaths(root, initial, edited), ['a.txt']);
  writeFileSync(path.join(root, 'a.txt'), 'edited twice\n');
  const editedTwice = await readTreeState(root);
  assert.deepEqual(await changedPaths(root, edited, editedTwice), ['a.txt']);

  git(root, 'commit', '--quiet', '--all', '--message', 'edit');
  const committed = await readTreeState(root);
  assert.notEqual(committed.commit, editedTwice.commit);
  assert.deepEqual(await changedPaths(root, editedTwice, committed), ['a.txt']);

  writeFileSync(path.join(root, 'lib/c.txt'), 'three\n');
  unlinkSync(path.join(root, 'lib/b.txt'));
  const staged = await readTreeState(root);
  assert.deepEqual(await changedPaths(root, committed, staged), ['lib/b.txt', 'lib/c.txt']);
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '--message', 'move');
  assert.deepEqual(await changedPaths(root, committed, await readTreeState(root)),
    ['lib/b.txt', 'lib/c.txt']);
});

test('synchronizes Git-visible files and keeps build outputs', async t => {
  const root = repository(t);
  const tree = temporary(t, 'crudui-build-tree-');
  const manifestFile = path.join(tree, '.state/manifest.json');
  mkdirSync(path.join(root, 'ignored'));
  writeFileSync(path.join(root, 'ignored/output.txt'), 'host output\n');

  const synchronized = await synchronizeTree({ source: root, tree, manifestFile });
  assert.deepEqual(synchronized, ['.gitignore', 'a.txt', 'lib/b.txt']);
  assert.equal(readFileSync(path.join(tree, 'a.txt'), 'utf8'), 'one\n');
  assert.throws(() => readFileSync(path.join(tree, 'ignored/output.txt')), /ENOENT/);

  mkdirSync(path.join(tree, 'dist'));
  writeFileSync(path.join(tree, 'dist/index.js'), 'built\n');
  writeFileSync(path.join(root, 'new.txt'), 'new\n');
  unlinkSync(path.join(root, 'lib/b.txt'));
  await applyTreeChanges({ source: root, tree, manifestFile, paths: ['lib/b.txt', 'new.txt'] });
  assert.equal(readFileSync(path.join(tree, 'new.txt'), 'utf8'), 'new\n');
  assert.throws(() => readFileSync(path.join(tree, 'lib/b.txt')), /ENOENT/);
  assert.deepEqual(JSON.parse(readFileSync(manifestFile, 'utf8')), ['.gitignore', 'a.txt', 'new.txt']);

  unlinkSync(path.join(root, 'a.txt'));
  await synchronizeTree({ source: root, tree, manifestFile });
  assert.throws(() => readFileSync(path.join(tree, 'a.txt')), /ENOENT/);
  assert.equal(readFileSync(path.join(tree, 'dist/index.js'), 'utf8'), 'built\n');

  await assert.rejects(applyTreeChanges({ source: root, tree, manifestFile, paths: ['../escape'] }),
    /normalized repository path/);
});
