// The files that the checks of the checkout read (scripts/kit/tracked-files.mjs): tracked files and new files that Git does
// not ignore; a file under an ignored directory such as var/ is none of them, and no check walks the tree with its own
// list of skipped directory names.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../scripts/kit/paths.mjs';
import { checkedFiles, ignoredPaths } from '../../scripts/kit/tracked-files.mjs';

test('the files of a checkout are tracked or new and not ignored, never under an ignored directory', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-tracked-files-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  writeFileSync(path.join(directory, '.gitignore'), '/var/\nnode_modules/\n');
  for (const file of ['src/a.mjs', 'var/copy/dist/index.d.ts', 'node_modules/x/index.js', 'new.mjs']) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), '\n');
  }
  execFileSync('git', ['add', '.gitignore', 'src/a.mjs'], { cwd: directory });
  assert.deepEqual(checkedFiles(directory), ['.gitignore', 'new.mjs', 'src/a.mjs']);
  assert.deepEqual(ignoredPaths(directory), ['node_modules/', 'var/']);
  // From a subdirectory, the paths are relative to it.
  assert.deepEqual(checkedFiles(path.join(directory, 'src')), ['a.mjs']);
});

test('no check walks the tree with its own list of skipped directory names', () => {
  const violations = [];
  for (const file of checkedFiles(ROOT).filter(name => /\.(?:mjs|js|ts)$/.test(name))) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    source.split('\n').forEach((line, index) => {
      if (/new Set\(\[[^\]]*'node_modules'/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, [], 'read the files of the checkout through scripts/kit/tracked-files.mjs');
});
