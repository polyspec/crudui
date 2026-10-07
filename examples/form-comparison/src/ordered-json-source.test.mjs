import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  installOrderedJson,
  orderedJsonAtTag,
  orderedJsonPackages,
  orderedJsonRepository,
  orderedJsonTag,
  orderedJsonVersion,
} from './ordered-json-source.mjs';

const execFileAsync = promisify(execFile);
const tagRef = `refs/tags/${orderedJsonTag}`;
const tagCommit = 'a'.repeat(40);
const otherCommit = 'b'.repeat(40);

async function withDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-ordered-json-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** A git stub whose checkouts have HEAD at `heads[cwd]` (the tag commit by default) and the tag ref at `tagCommit`. */
function fakeGit(calls, heads = {}) {
  return async (cwd, args) => {
    calls.push({ cwd, args });
    if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') {
      if (cwd in heads && heads[cwd] === undefined) throw new Error('not a git repository');
      return `${heads[cwd] ?? tagCommit}\n`;
    }
    if (args[0] === 'rev-parse' && args[2] === `${tagRef}^{commit}`) return `${tagCommit}\n`;
    return '';
  };
}

test('declares the tag of the OrderedJSON version', () => {
  assert.equal(orderedJsonTag, `v${orderedJsonVersion}`);
  assert.equal(orderedJsonTag, 'v0.0.1');
});

test('installs the tag of the monorepo and verifies its commit and every package path', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    const calls = [];
    const stub = fakeGit(calls, { [target]: undefined });
    const git = async (cwd, args) => {
      // The previous checkout stays in place while the new one is made beside it.
      assert.equal(await readFile(path.join(target, 'previous'), 'utf8'), 'previous checkout\n');
      return stub(cwd, args);
    };

    const result = await installOrderedJson(target, git);

    assert.deepEqual(result, {
      repository: orderedJsonRepository,
      version: orderedJsonVersion,
      tag: orderedJsonTag,
      packages: { ...orderedJsonPackages },
      installed: true,
    });
    const next = `${target}.next-${process.pid}`;
    const installCalls = calls.filter(({ cwd }) => cwd === next);
    assert.equal(calls.some(({ args }) => args[0] === 'submodule' || args.includes('main')), false);
    assert.deepEqual(installCalls.map(({ args }) => args[0]), [
      'init', 'fetch', 'checkout', 'rev-parse', 'rev-parse', 'status',
      ...Object.keys(orderedJsonPackages).map(() => 'cat-file'),
    ]);
    assert.deepEqual(installCalls[1].args,
      ['fetch', '--quiet', '--depth=1', '--no-tags', orderedJsonRepository, `+${tagRef}:${tagRef}`]);
    assert.deepEqual(installCalls[2].args, ['checkout', '--quiet', '--detach', `${tagRef}^{commit}`]);
    assert.deepEqual([...new Set(calls.map(({ cwd }) => cwd))], [target, next]);
    assert.deepEqual(await readdir(directory), ['ordered-json']);
    assert.deepEqual(await readdir(target), []);
  }));

test('keeps a checkout at the commit of the tag without fetching', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'current'), 'current checkout\n');
    const calls = [];

    const result = await installOrderedJson(target, fakeGit(calls));

    assert.equal(result.installed, false);
    assert.equal(calls.some(({ args }) => args[0] === 'fetch'), false);
    assert.equal(await readFile(path.join(target, 'current'), 'utf8'), 'current checkout\n');
  }));

test('replaces a checkout at another commit than the tag', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    const calls = [];

    const result = await installOrderedJson(target, fakeGit(calls, { [target]: otherCommit }));

    assert.equal(result.installed, true);
    assert.equal(calls.filter(({ args }) => args[0] === 'fetch').length, 1);
    assert.deepEqual(await readdir(target), []);
  }));

test('rejects a fetched checkout that is not at the commit of the tag', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    const next = `${target}.next-${process.pid}`;
    await assert.rejects(
      () => installOrderedJson(target, fakeGit([], { [target]: otherCommit, [next]: otherCommit })),
      new RegExp(`not at the commit of the tag ${orderedJsonTag.replaceAll('.', '\\.')}`));
    assert.deepEqual(await readdir(directory), ['ordered-json']);
    assert.equal(await readFile(path.join(target, 'previous'), 'utf8'), 'previous checkout\n');
  }));

test('rejects a monorepo tag missing a required package', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    const stub = fakeGit([], { [target]: undefined });
    const git = async (cwd, args) => {
      if (args[0] === 'cat-file' && args[2]?.endsWith('php/composer.json')) {
        throw new Error('missing package');
      }
      return stub(cwd, args);
    };
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    await assert.rejects(() => installOrderedJson(target, git),
      new RegExp(`missing from the monorepo tag ${orderedJsonTag.replaceAll('.', '\\.')}: php`));
    // A failed checkout leaves the previous one and no directory of its own.
    assert.deepEqual(await readdir(directory), ['ordered-json']);
    assert.equal(await readFile(path.join(target, 'previous'), 'utf8'), 'previous checkout\n');
  }));

test('accepts a Git checkout only at the commit of its tag ref and without tracked changes', { timeout: 10000 }, () =>
  withDirectory(async directory => {
    const git = (...args) => execFileAsync('git', ['-C', directory, '-c', 'user.name=test', '-c', 'user.email=test@example.com',
      '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args]);
    await git('init', '--quiet');
    await writeFile(path.join(directory, 'file.json'), '{}\n');
    await git('add', 'file.json');
    await git('commit', '--quiet', '-m', 'first');
    assert.equal(await orderedJsonAtTag(directory), false, 'a checkout without the tag ref');
    await git('tag', '--annotate', '-m', orderedJsonTag, orderedJsonTag);
    assert.equal(await orderedJsonAtTag(directory), true, 'a checkout at the tag');
    await writeFile(path.join(directory, 'file.json'), '[]\n');
    await git('commit', '--quiet', '--all', '-m', 'second');
    assert.equal(await orderedJsonAtTag(directory), false, 'a checkout at another commit');
    await git('checkout', '--quiet', '--detach', `${tagRef}^{commit}`);
    assert.equal(await orderedJsonAtTag(directory), true, 'the same checkout back at the tag');
    await writeFile(path.join(directory, 'file.json'), '{"a":1}\n');
    assert.equal(await orderedJsonAtTag(directory), false, 'a checkout with tracked changes');
    assert.equal(await orderedJsonAtTag(path.join(directory, 'missing')), false, 'a missing checkout');
  }));
