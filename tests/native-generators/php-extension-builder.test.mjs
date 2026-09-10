import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertRegularPath,
  cleanGeneratedPaths,
  readPhpMetadata,
  resolvePhpBuildTools,
} from '../../scripts/php-extension-builder.mjs';

async function executable(filename) {
  await writeFile(filename, '#!/bin/sh\nexit 0\n');
  await chmod(filename, 0o755);
  return filename;
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-php-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('tool discovery uses regular executables and the Rust toolchain record', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  const toolchain = path.join(root, 'toolchain');
  await Promise.all([mkdir(bin), mkdir(toolchain)]);
  const phpConfig = await executable(path.join(bin, 'php-config'));
  const compiler = await executable(path.join(bin, 'cc'));
  const rustup = await executable(path.join(bin, 'rustup'));
  const cargo = await executable(path.join(toolchain, 'cargo'));
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, args]);
    if (file === rustup && args[0] === 'which') return { stdout: cargo + '\n', stderr: '' };
    if (file === phpConfig) return { stdout: '8.5.10\n', stderr: '' };
    if (file === compiler) return { stdout: 'clang version 21.0.0\n', stderr: '' };
    if (file === rustup) return { stdout: 'rustup 1.29.0\n', stderr: '' };
    if (file === cargo) return { stdout: 'cargo 1.98.1\n', stderr: '' };
    throw new Error('Unexpected command: ' + file + ' ' + args.join(' '));
  };

  assert.deepEqual(await resolvePhpBuildTools({
    environment: { PATH: bin }, needsCargo: true, run,
  }), { phpConfig, compiler, cargo });
  assert.deepEqual(calls.filter(([, args]) => args[0] === 'which'), [
    [rustup, ['which', 'cargo']],
  ]);
});

test('tool discovery rejects symbolic and ambiguous executable paths', async t => {
  const root = await temporaryDirectory(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const tools = path.join(root, 'tools');
  await Promise.all([mkdir(first), mkdir(second), mkdir(tools)]);
  const target = await executable(path.join(tools, 'php-config'));
  await symlink(target, path.join(first, 'php-config'));
  await executable(path.join(first, 'cc'));

  await assert.rejects(resolvePhpBuildTools({
    environment: { PATH: first }, needsCargo: false,
    run: async () => ({ stdout: 'clang version 21.0.0\n', stderr: '' }),
  }), /symbolic link/i);

  await rm(path.join(first, 'php-config'));
  await executable(path.join(first, 'php-config'));
  await executable(path.join(second, 'php-config'));
  await executable(path.join(second, 'cc'));
  await assert.rejects(resolvePhpBuildTools({
    environment: { PATH: first + path.delimiter + second }, needsCargo: false,
    run: async () => ({ stdout: '8.5.10\n', stderr: '' }),
  }), /requires one result; received 2/i);

  await assert.rejects(assertRegularPath('relative/php-config', 'file'), /absolute/i);
});

test('PHP metadata uses one matching installation and declared include paths', async t => {
  const root = await temporaryDirectory(t);
  const prefix = path.join(root, 'php');
  const include = path.join(prefix, 'include', 'php');
  const mainInclude = path.join(include, 'main');
  const bin = path.join(prefix, 'bin');
  await Promise.all([mkdir(mainInclude, { recursive: true }), mkdir(bin)]);
  const phpConfig = await executable(path.join(bin, 'php-config'));
  const php = await executable(path.join(bin, 'php'));
  const values = {
    '--prefix': prefix,
    '--includes': '-I' + include + ' -I' + mainInclude,
    '--vernum': '80510',
    '--php-binary': php,
  };
  const run = async (file, args) => {
    if (file === phpConfig) return { stdout: values[args[0]] + '\n', stderr: '' };
    if (file === php) return { stdout: '[80510,8,0,0]', stderr: '' };
    throw new Error('Unexpected command: ' + file);
  };

  const metadata = await readPhpMetadata(phpConfig, {
    minimumVersion: 80400, require64Bit: true, run,
  });
  assert.deepEqual(metadata.includeArguments, ['-I' + include, '-I' + mainInclude]);
  assert.equal(metadata.executable, php);
  assert.equal(metadata.version, 80510);
});

test('generated path cleanup rejects a symbolic link without changing its target', async t => {
  const root = await temporaryDirectory(t);
  const target = path.join(root, 'retained');
  const extension = path.join(root, 'extension');
  const generated = path.join(extension, '.build');
  await Promise.all([mkdir(target), mkdir(extension)]);
  const retained = path.join(target, 'sentinel');
  await writeFile(retained, 'retained\n');
  await symlink(target, generated);

  await assert.rejects(cleanGeneratedPaths(extension, ['.build']), /symbolic link/i);
  assert.equal(await readFile(retained, 'utf8'), 'retained\n');
});
