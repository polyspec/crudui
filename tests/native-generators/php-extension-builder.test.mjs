import assert from 'node:assert/strict';
import {
  chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertRegularPath,
  cleanGeneratedPaths,
  readPhpMetadata,
  resolvePhpBuildTools,
} from '../../scripts/php-extension-builder.mjs';
import { rustBuildEnvironment } from '../../scripts/build-crudui-php-extension.mjs';

async function executable(filename) {
  await writeFile(filename, '#!/bin/sh\nexit 0\n');
  await chmod(filename, 0o755);
  return filename;
}

async function temporaryDirectory(t) {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, 'crudui-php-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('non-Linux tool discovery uses regular executables and the Rust toolchain record', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  const toolchain = path.join(root, 'toolchain');
  await Promise.all([mkdir(bin), mkdir(toolchain)]);
  const phpConfig = await executable(path.join(bin, 'php-config'));
  const compiler = await executable(path.join(bin, 'cc'));
  const rustup = await executable(path.join(bin, 'rustup'));
  const cargo = await executable(path.join(toolchain, 'cargo'));
  const rustc = await executable(path.join(toolchain, 'rustc'));
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, args]);
    if (file === rustup && args[0] === 'which') {
      return { stdout: (args[1] === 'cargo' ? cargo : rustc) + '\n', stderr: '' };
    }
    if (file === phpConfig) return { stdout: '8.5.10\n', stderr: '' };
    if (file === compiler) return { stdout: 'clang version 21.0.0\n', stderr: '' };
    if (file === rustup) return { stdout: 'rustup 1.29.0\n', stderr: '' };
    if (file === cargo) return { stdout: 'cargo 1.98.1\n', stderr: '' };
    if (file === rustc) {
      return { stdout: 'rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n', stderr: '' };
    }
    throw new Error('Unexpected command: ' + file + ' ' + args.join(' '));
  };

  assert.deepEqual(await resolvePhpBuildTools({
    environment: { PATH: bin }, needsCargo: true, platform: 'darwin', run,
  }), { phpConfig, compiler, cargo, rustc, rustHost: 'aarch64-test-system' });
  assert.deepEqual(calls.filter(([, args]) => args[0] === 'which'), [
    [rustup, ['which', 'cargo']],
    [rustup, ['which', 'rustc']],
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

test('Linux tool discovery follows Debian package records to one target compiler', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const phpConfig = await executable(path.join(bin, 'php-config8.4'));
  const packageQuery = await executable(path.join(bin, 'dpkg-query'));
  const compiler = await executable(path.join(bin, 'aarch64-linux-gnu-gcc-14'));
  const calls = [];
  const statusAndDependencies = '-f=${db:Status-Abbrev}\n${Depends}\n';
  const status = '-f=${db:Status-Abbrev}\n';
  const run = async (file, args, options) => {
    calls.push([file, args, options]);
    if (file === phpConfig) return { stdout: '8.4.11\n', stderr: '' };
    if (file === compiler) return { stdout: 'gcc (Debian 14.2.0) 14.2.0\n', stderr: '' };
    if (file !== packageQuery) throw new Error('Unexpected command: ' + file);
    if (args[0] === '-L') {
      assert.deepEqual(args, ['-L', 'gcc-14-aarch64-linux-gnu']);
      return { stdout: compiler + '\n', stderr: '' };
    }
    if (args[2] === 'gcc') {
      assert.deepEqual(args, ['-W', statusAndDependencies, 'gcc']);
      return {
        stdout: 'ii \ncpp, gcc-14 (>= 14.2.0-6~), gcc-aarch64-linux-gnu\n',
        stderr: '',
      };
    }
    if (args[2] === 'gcc-14') {
      assert.deepEqual(args, ['-W', statusAndDependencies, 'gcc-14']);
      return {
        stdout: 'ii \ngcc-14-aarch64-linux-gnu (= 14.2.0-19), gcc-14-base\n',
        stderr: '',
      };
    }
    assert.deepEqual(args, ['-W', status, 'gcc-14-aarch64-linux-gnu']);
    return { stdout: 'ii \n', stderr: '' };
  };

  assert.deepEqual(await resolvePhpBuildTools({
    environment: { PATH: bin },
    needsCargo: false,
    packageQuery,
    phpConfig,
    platform: 'linux',
    run,
  }), { phpConfig, compiler });
  assert.deepEqual(calls.map(([file, args]) => [file, args]), [
    [phpConfig, ['--version']],
    [packageQuery, ['-W', statusAndDependencies, 'gcc']],
    [packageQuery, ['-W', statusAndDependencies, 'gcc-14']],
    [packageQuery, ['-W', status, 'gcc-14-aarch64-linux-gnu']],
    [packageQuery, ['-L', 'gcc-14-aarch64-linux-gnu']],
    [compiler, ['--version']],
  ]);
  assert.ok(calls.every(([, , options]) => options.capture === true));
});

test('PHP metadata uses one matching installation and declared include paths', async t => {
  const root = await temporaryDirectory(t);
  const prefix = path.join(root, 'php');
  const include = path.join(prefix, 'include', 'php');
  const mainInclude = path.join(include, 'main');
  const bin = path.join(prefix, 'bin');
  await mkdir(prefix);
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
    if (file === php) return { stdout: '[80510,8,false,false]', stderr: '' };
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

  const nestedTarget = path.join(root, 'nested-retained');
  const linkedParent = path.join(extension, 'native');
  await mkdir(nestedTarget);
  const nestedRetained = path.join(nestedTarget, 'output');
  await writeFile(nestedRetained, 'nested retained\n');
  await symlink(nestedTarget, linkedParent);
  await assert.rejects(cleanGeneratedPaths(extension, ['native/output']), /symbolic link/i);
  assert.equal(await readFile(nestedRetained, 'utf8'), 'nested retained\n');
});

test('Rust build environment declares regular compiler and linker paths', () => {
  assert.deepEqual(rustBuildEnvironment({ PATH: '/declared/bin' }, {
    compiler: '/tools/cc',
    rustc: '/toolchain/rustc',
    rustHost: 'aarch64-apple-darwin',
  }), {
    PATH: '/declared/bin',
    RUSTC: '/toolchain/rustc',
    CC: '/tools/cc',
    CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER: '/tools/cc',
  });
});
