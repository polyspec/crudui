// The reproducible build check (scripts/repeat-build.mjs): it covers every published package and names every file
// whose bytes differ between two builds. The check builds twice itself; these cases read no build record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PACKAGES } from '../../scripts/package-outputs.mjs';
import { buildDifferences } from '../../scripts/repeat-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// contracts/features.json records every published npm package; the check compares all of them.
const published = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8')).packages
  .map(({ path }) => relative(resolve(root, 'packages'), resolve(root, path)));

test('the reproducible build check covers every published package', () => {
  assert.deepEqual([...PACKAGES].sort(), [...published].sort());
});

test('two builds that wrote the same bytes have no difference', () => {
  const files = [{ path: 'packages/a/dist/index.js', sha256: 'a1' }, { path: 'packages/a/dist/index.d.ts', sha256: 'b2' }];
  assert.deepEqual(buildDifferences(files, [...files].reverse()), []);
});

test('every changed, missing and added file is named with both digests', () => {
  const first = [{ path: 'p/dist/a.js', sha256: '1' }, { path: 'p/dist/b.js', sha256: '2' }, { path: 'p/dist/c.js', sha256: '3' }];
  const second = [{ path: 'p/dist/a.js', sha256: '1' }, { path: 'p/dist/b.js', sha256: '9' }, { path: 'p/dist/d.js', sha256: '4' }];
  assert.deepEqual(buildDifferences(first, second), [
    'p/dist/b.js: the first build wrote 2, the second 9',
    'p/dist/c.js: only the first build wrote it (3)',
    'p/dist/d.js: only the second build wrote it (4)',
  ]);
});
