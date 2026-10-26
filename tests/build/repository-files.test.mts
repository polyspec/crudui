// The files that the rules of this repository read (scripts/repository-files.mts): the files of the checkout without the
// copies that make kit-sync writes from the installed package @polyspec/kit (kit.copies of its package.json).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isVendored, kitCopies, ownedFiles } from '../../scripts/repository-files.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');

test('the copies of kit are the paths of kit.copies of the installed @polyspec/kit, and nothing else is a copy', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-repository-files-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  writeFileSync(path.join(directory, '.gitignore'), 'node_modules/\n');
  const kit = { name: '@polyspec/kit', kit: { copies: { 'scripts/kit/kit-bootstrap.mk': 'scripts/kit/kit-bootstrap.mk', 'ruff.toml': 'ruff.toml' }, owners: [{ paths: ['.github/workflows/release.yml', '.githooks/*'] }] } };
  const files = ['.gitignore', 'scripts/kit/kit-bootstrap.mk', 'scripts/kitchen.mjs', 'ruff.toml', 'tools/own.mjs', 'package.json', '.github/workflows/release.yml', '.githooks/pre-commit'];
  for (const file of [...files, 'node_modules/@polyspec/kit/package.json']) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), file.startsWith('node_modules/') ? JSON.stringify(kit) : '{}\n');
  }
  assert.deepEqual(kitCopies(directory), ['ruff.toml', 'scripts/kit/kit-bootstrap.mk']);
  assert.deepEqual(ownedFiles(directory), ['.gitignore', 'package.json', 'scripts/kitchen.mjs', 'tools/own.mjs']);
  assert.deepEqual(files.filter(file => isVendored(file, directory)), ['scripts/kit/kit-bootstrap.mk', 'ruff.toml', '.github/workflows/release.yml', '.githooks/pre-commit']);
});

test('a checkout without the installed @polyspec/kit names the install instead of a list of copies', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-repository-files-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => kitCopies(directory), { message: `${path.join(directory, 'node_modules/@polyspec/kit/package.json')} is missing; run make install-tools TOOLS=npm, then make install-packages` });
});

test('the files of this repository exclude the copies of kit and hold the sources of the repository', () => {
  const files = ownedFiles(ROOT);
  assert.deepEqual(files.filter(file => kitCopies(ROOT).includes(file)), []);
  assert.ok(files.includes('scripts/repository-files.mts') && files.includes('Makefile'));
});
