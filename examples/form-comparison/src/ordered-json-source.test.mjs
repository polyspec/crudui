import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  installOrderedJson,
  orderedJsonPackages,
  orderedJsonRepository,
  orderedJsonRevision,
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

test('installs one pinned monorepo and verifies every package path', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const calls = [];
    const git = async (cwd, args) => {
      calls.push({ cwd, args });
      if (args[0] === 'cat-file' && args[2]?.endsWith('^{commit}')) throw new Error('missing object');
      return '';
    };

    const result = await installOrderedJson(directory, git);

    assert.deepEqual(result, {
      repository: orderedJsonRepository,
      version: orderedJsonVersion,
      commit: orderedJsonRevision,
      packages: { ...orderedJsonPackages },
    });
    assert.equal(calls.some(({ args }) => args[0] === 'submodule'), false);
    assert.deepEqual(calls.map(({ args }) => args[0]), [
      'init', 'cat-file', 'fetch', 'checkout', 'status',
      ...Object.keys(orderedJsonPackages).map(() => 'cat-file'),
    ]);
  }));

test('rejects a pinned monorepo missing a required package', { timeout: 1000 }, () =>
  withDirectory(async directory => {
    const git = async (_cwd, args) => {
      if (args[0] === 'cat-file' && args[2]?.endsWith('php/composer.json')) {
        throw new Error('missing package');
      }
      return '';
    };
    await assert.rejects(() => installOrderedJson(directory, git),
      /missing from the pinned monorepo: php/);
  }));
