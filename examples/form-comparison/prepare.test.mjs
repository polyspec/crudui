import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareCandidate, requiredSourcePaths } from './prepare.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

function git(repository, ...args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

function temporary(t, prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function repository(t) {
  const root = temporary(t, 'crudui-candidate-source-');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'CRUDUI Test');
  git(root, 'config', 'user.email', 'test@crudui.invalid');
  for (const file of requiredSourcePaths) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file),
      file.endsWith('Containerfile') ? 'FROM scratch\n' : file + '\n');
  }
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'Create candidate source');
  return root;
}

function dependency() {
  return {
    metadata: { commit: 'b'.repeat(40), archiveSha256: 'c'.repeat(64), submodules: {} },
    files: new Map([['ordered-json.tar', Buffer.from('ordered json')]]),
  };
}

test('current candidate commit contains every required source file', () => {
  if (existsSync(path.join(repositoryRoot, '.git'))) {
    const commit = git(repositoryRoot, 'rev-parse', 'HEAD');
    for (const file of requiredSourcePaths) {
      assert.doesNotThrow(
        () => git(repositoryRoot, 'cat-file', '-e', `${commit}:${file}`),
        `Candidate commit is missing required file: ${file}`,
      );
    }
    return;
  }
  for (const file of requiredSourcePaths) {
    assert.ok(existsSync(path.join(repositoryRoot, file)),
      `Candidate archive is missing required file: ${file}`);
  }
});

test('prepares one context from the complete current source commit', async t => {
  const root = repository(t);
  const work = temporary(t, 'crudui-candidate-work-');
  const commit = git(root, 'rev-parse', 'HEAD');
  const input = { repository: root, reference: commit, workDirectory: work,
    orderedJson: dependency };
  const result = await prepareCandidate(input);
  assert.equal(result.metadata.source.commit, commit);
  assert.match(result.metadata.source.archiveSha256, /^[0-9a-f]{64}$/);
  const entries = execFileSync('tar', ['-tf', path.join(result.context, 'source.tar')],
    { encoding: 'utf8' }).trim().split('\n');
  for (const file of ['package.json', 'examples/form-comparison/Containerfile',
    'packages/generator-go/go.mod', 'scripts/tool-resolution.mjs',
    'scripts/php-extension-builder.mjs',
    'scripts/build-crudui-php-extension.mjs',
    'scripts/build-ordered-json-php-extension.mjs']) {
    assert.ok(entries.includes(file), 'Missing source archive entry: ' + file);
  }
  assert.equal(readFileSync(path.join(result.context, 'Containerfile'), 'utf8'), 'FROM scratch\n');
  assert.equal(readFileSync(path.join(result.context, 'verify-candidate-context.mjs'), 'utf8'),
    'examples/form-comparison/verify-candidate-context.mjs\n');
  assert.equal(readFileSync(path.join(result.context, 'source-commit'), 'utf8'), commit + '\n');
  assert.deepEqual((await prepareCandidate(input)).metadata, result.metadata);
});

test('rejects an earlier commit and source changes', async t => {
  const root = repository(t);
  const work = temporary(t, 'crudui-candidate-work-');
  const earlier = git(root, 'rev-parse', 'HEAD');
  writeFileSync(path.join(root, 'current.txt'), 'current\n');
  git(root, 'add', 'current.txt');
  git(root, 'commit', '--quiet', '-m', 'Advance source');
  await assert.rejects(prepareCandidate({ repository: root, reference: earlier,
    workDirectory: work, orderedJson: dependency }), /must be the current HEAD/);
  writeFileSync(path.join(root, 'current.txt'), 'changed\n');
  await assert.rejects(prepareCandidate({ repository: root, reference: 'HEAD',
    workDirectory: work, orderedJson: dependency }), /repository contains tracked or untracked changes/);
});

test('rejects changed context bytes for the same source commit', async t => {
  const root = repository(t);
  const input = { repository: root, reference: 'HEAD',
    workDirectory: temporary(t, 'crudui-candidate-work-'), orderedJson: dependency };
  const result = await prepareCandidate(input);
  writeFileSync(path.join(result.context, 'metadata.json'), '{}\n');
  await assert.rejects(prepareCandidate(input), /context differs/);
});
