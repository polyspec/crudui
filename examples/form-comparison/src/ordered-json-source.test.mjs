import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  installOrderedJson,
  orderedJsonBranch,
  orderedJsonPackages,
  orderedJsonRepository,
  orderedJsonVersion,
} from './ordered-json-source.mjs';

async function withDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-ordered-json-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('installs the head of the monorepo branch main and verifies every package path', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    const calls = [];
    const git = async (cwd, args) => {
      calls.push({ cwd, args });
      // The previous checkout stays in place while the new one is made beside it.
      assert.equal(await readFile(path.join(target, 'previous'), 'utf8'), 'previous checkout\n');
      return '';
    };

    const result = await installOrderedJson(target, git);

    assert.deepEqual(result, {
      repository: orderedJsonRepository,
      version: orderedJsonVersion,
      branch: orderedJsonBranch,
      packages: { ...orderedJsonPackages },
    });
    assert.equal(calls.some(({ args }) => args[0] === 'submodule'), false);
    assert.deepEqual(calls.map(({ args }) => args[0]), [
      'init', 'fetch', 'checkout', 'status',
      ...Object.keys(orderedJsonPackages).map(() => 'cat-file'),
    ]);
    assert.deepEqual(calls[1].args, ['fetch', '--quiet', '--depth=1', orderedJsonRepository, 'main']);
    assert.deepEqual(calls[2].args, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    assert.deepEqual([...new Set(calls.map(({ cwd }) => cwd))], [`${target}.next-${process.pid}`]);
    assert.deepEqual(await readdir(directory), ['ordered-json']);
    assert.deepEqual(await readdir(target), []);
  }));

test('rejects a monorepo branch missing a required package', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const git = async (_cwd, args) => {
      if (args[0] === 'cat-file' && args[2]?.endsWith('php/composer.json')) {
        throw new Error('missing package');
      }
      return '';
    };
    const target = path.join(directory, 'ordered-json');
    await mkdir(target);
    await writeFile(path.join(target, 'previous'), 'previous checkout\n');
    await assert.rejects(() => installOrderedJson(target, git),
      /missing from the monorepo branch main: php/);
    // A failed checkout leaves the previous one and no directory of its own.
    assert.deepEqual(await readdir(directory), ['ordered-json']);
    assert.equal(await readFile(path.join(target, 'previous'), 'utf8'), 'previous checkout\n');
  }));
