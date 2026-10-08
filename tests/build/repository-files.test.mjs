// The files that the rules of this repository read (scripts/repository-files.mjs): the files of the checkout without the
// vendored copy of polyspec/kit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../scripts/kit/paths.mjs';
import { isVendored, ownedFiles, vendoredPrefixes } from '../../scripts/repository-files.mjs';

test('the vendored copy is kit.json, .kit and the directories that kit.json lists, and nothing else is vendored', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-repository-files-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  writeFileSync(path.join(directory, 'kit.json'), JSON.stringify({ schema: 1, vendored: ['tools/kit', 'tests/kit'] }));
  const files = ['kit.json', '.kit/kit.lock.json', 'tools/kit/a.mjs', 'tests/kit/fixture/package.json', 'tests/kitchen/b.mjs', 'tools/own.mjs', 'package.json'];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    if (file !== 'kit.json') writeFileSync(path.join(directory, file), '{}\n');
  }
  assert.deepEqual(vendoredPrefixes(directory), ['kit.json', '.kit/', 'tools/kit/', 'tests/kit/']);
  assert.deepEqual(ownedFiles(directory), ['package.json', 'tests/kitchen/b.mjs', 'tools/own.mjs']);
  assert.deepEqual(files.filter(file => isVendored(file, directory)), ['kit.json', '.kit/kit.lock.json', 'tools/kit/a.mjs', 'tests/kit/fixture/package.json']);
});

test('the files of this repository exclude scripts/kit, tests/kit, .kit and kit.json and hold the sources of the repository', () => {
  const files = ownedFiles(ROOT);
  assert.deepEqual(files.filter(file => file === 'kit.json' || /^(?:scripts\/kit|tests\/kit|\.kit)\//.test(file)), []);
  assert.ok(files.includes('scripts/repository-files.mjs') && files.includes('Makefile'));
});
