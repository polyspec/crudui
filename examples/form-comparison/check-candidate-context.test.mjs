import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  orderedJsonRevision, orderedJsonSubmodules, readGitArchiveCommit,
  verifyCandidateContext,
} from './verify-candidate-context.mjs';

test('verifies the candidate source archive without buffered pipe input', async () => {
  const source = await readFile(new URL('./Containerfile', import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /input:\s*readFileSync\(['"]\/archives\/source\.tar['"]\)/);
  assert.match(source, /verify-candidate-context\.mjs/);
});

test('passes a large source archive to Git through a file descriptor', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-candidate-context-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, 'source.tar');
  writeFileSync(archive, Buffer.alloc(2 * 1024 * 1024, 1));
  let descriptor;
  const commit = 'a'.repeat(40);
  assert.equal(readGitArchiveCommit(archive, (command, args, options) => {
    assert.equal(command, 'git');
    assert.deepEqual(args, ['get-tar-commit-id']);
    assert.equal(Object.hasOwn(options, 'input'), false);
    descriptor = options.stdio[0];
    assert.equal(fstatSync(descriptor).size, 2 * 1024 * 1024);
    return { error: undefined, signal: null, status: 0, stdout: `${commit}\n`, stderr: '' };
  }), commit);
  assert.throws(() => fstatSync(descriptor), { code: 'EBADF' });
});

function git(repository, ...args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-candidate-context-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = path.join(directory, 'source');
  mkdirSync(repository);
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'CRUDUI Test');
  git(repository, 'config', 'user.email', 'test@crudui.invalid');
  writeFileSync(path.join(repository, 'source.txt'), 'source\n');
  git(repository, 'add', 'source.txt');
  git(repository, 'commit', '--quiet', '-m', 'Create source');
  const commit = git(repository, 'rev-parse', 'HEAD');
  execFileSync('git', ['archive', '--output', path.join(directory, 'source.tar'), commit],
    { cwd: repository });
  writeFileSync(path.join(directory, 'ordered-json.tar'), 'ordered-json');
  for (const name of Object.keys(orderedJsonSubmodules)) {
    writeFileSync(path.join(directory, `ordered-json-${name}.tar`), name);
  }
  const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const submodules = Object.fromEntries(Object.entries(orderedJsonSubmodules).map(
    ([name, revision]) => [name, { commit: revision,
      archiveSha256: digest(path.join(directory, `ordered-json-${name}.tar`)) }],
  ));
  const metadata = {
    source: { commit, archiveSha256: digest(path.join(directory, 'source.tar')) },
    orderedJson: {
      commit: orderedJsonRevision,
      archiveSha256: digest(path.join(directory, 'ordered-json.tar')),
      submodules,
    },
  };
  writeFileSync(path.join(directory, 'source-commit'), `${commit}\n`);
  writeFileSync(path.join(directory, 'metadata.json'), `${JSON.stringify(metadata)}\n`);
  return { directory, metadata };
}

test('accepts the exact source and OrderedJSON archive set', async t => {
  const { directory, metadata } = await fixture(t);
  assert.deepEqual(await verifyCandidateContext(directory), metadata);
});

test('rejects source, common and implementation changes', async t => {
  const { directory } = await fixture(t);
  writeFileSync(path.join(directory, 'ordered-json-js.tar'), 'changed');
  await assert.rejects(verifyCandidateContext(directory),
    /OrderedJSON implementation js archive hash differs/);
});
