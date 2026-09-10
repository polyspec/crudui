import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runRustCommand } from '../../scripts/run-rust-command.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const make = process.env.MAKE || '/usr/bin/make';

async function writeExecutable(filename) {
  await writeFile(filename, [
    '#!/bin/sh',
    'printf \'%s\t%s\n\' "${0##*/}" "$*" >> "$COMMAND_LOG"',
    '',
  ].join('\n'));
  await chmod(filename, 0o755);
}

test('test-native invokes the shared Rust command entry point', {
  skip: process.platform === 'win32',
}, async t => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'crudui-make-path-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const home = path.join(directory, 'home');
  const commandDirectory = path.join(directory, 'commands');
  const commandLog = path.join(directory, 'commands.log');
  await mkdir(home);
  await mkdir(commandDirectory);

  await Promise.all(['composer', 'go', 'node', 'npm', 'sh'].map(command => (
    writeExecutable(path.join(commandDirectory, command))
  )));

  const result = spawnSync(make, ['--no-print-directory', '-f', 'Makefile', 'test-native'], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      COMMAND_LOG: commandLog,
      HOME: home,
      LANG: 'C',
      LC_ALL: 'C',
      PATH: `${commandDirectory}:/usr/bin:/bin`,
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'));
  const commands = await readFile(commandLog, 'utf8');
  assert.match(commands,
    /^node\tscripts\/run-rust-command\.mjs test --locked --manifest-path packages\/generator-rust\/Cargo\.toml$/m);
});

test('the Rust command entry point executes regular toolchain files', {
  skip: process.platform === 'win32',
}, async t => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'crudui-rust-command-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const home = path.join(directory, 'home');
  const rustupDirectory = path.join(home, '.cargo', 'bin');
  const toolchain = path.join(directory, 'toolchain');
  const cargo = path.join(toolchain, 'cargo');
  const rustc = path.join(toolchain, 'rustc');
  const rustdoc = path.join(toolchain, 'rustdoc');
  const commandLog = path.join(directory, 'commands.log');
  await Promise.all([mkdir(rustupDirectory, { recursive: true }), mkdir(toolchain)]);
  const rustup = path.join(rustupDirectory, 'rustup');
  await writeFile(rustup, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then printf "rustup 1.29.0\n"; exit 0; fi',
    'if [ "$1" = "which" ] && [ "$2" = "cargo" ]; then printf "%s\n" "$TEST_CARGO"; exit 0; fi',
    'if [ "$1" = "which" ] && [ "$2" = "rustc" ]; then printf "%s\n" "$TEST_RUSTC"; exit 0; fi',
    'if [ "$1" = "which" ] && [ "$2" = "rustdoc" ]; then printf "%s\n" "$TEST_RUSTDOC"; exit 0; fi',
    'exit 2',
    '',
  ].join('\n'));
  await writeFile(cargo, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then printf "cargo 1.98.1\n"; exit 0; fi',
    "printf 'cargo\t%s\t%s\t%s\n' \"$*\" \"$RUSTC\" \"$RUSTDOC\" >> \"$COMMAND_LOG\"",
    '',
  ].join('\n'));
  await writeFile(rustc, [
    '#!/bin/sh',
    'printf "rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n"',
    '',
  ].join('\n'));
  await writeFile(rustdoc, [
    '#!/bin/sh',
    'printf "rustdoc 1.98.1 (test 2026-09-01)\n"',
    '',
  ].join('\n'));
  await Promise.all([rustup, cargo, rustc, rustdoc].map(filename => chmod(filename, 0o755)));

  const result = spawnSync(process.execPath, [
    path.join(repository, 'scripts/run-rust-command.mjs'),
    'test', '--locked', '--manifest-path', 'packages/generator-rust/Cargo.toml',
  ], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      COMMAND_LOG: commandLog,
      HOME: home,
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
      TEST_CARGO: cargo,
      TEST_RUSTC: rustc,
      TEST_RUSTDOC: rustdoc,
    },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(await readFile(commandLog, 'utf8'),
    `cargo\ttest --locked --manifest-path packages/generator-rust/Cargo.toml`
      + `\t${rustc}\t${rustdoc}\n`);
});

test('Rust toolchain resolution uses the Cargo working directory', async t => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'crudui-rust-cwd-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = path.join(directory, 'home');
  const rustupDirectory = path.join(home, '.cargo', 'bin');
  const toolchain = path.join(directory, 'toolchain');
  const workingDirectory = path.join(directory, 'crate');
  await Promise.all([
    mkdir(rustupDirectory, { recursive: true }), mkdir(toolchain), mkdir(workingDirectory),
  ]);
  const rustup = path.join(rustupDirectory, 'rustup');
  const cargo = path.join(toolchain, 'cargo');
  const rustc = path.join(toolchain, 'rustc');
  const rustdoc = path.join(toolchain, 'rustdoc');
  await Promise.all([rustup, cargo, rustc, rustdoc].map(writeExecutable));
  const calls = [];
  const run = async (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd });
    if (file === rustup && args[0] === '--version') return { stdout: 'rustup 1.29.0\n' };
    if (file === rustup && args[0] === 'which') {
      return { stdout: ({ cargo, rustc, rustdoc })[args[1]] + '\n' };
    }
    if (file === cargo && args[0] === '--version') return { stdout: 'cargo 1.98.1\n' };
    if (file === rustc) {
      return { stdout: 'rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n' };
    }
    if (file === rustdoc) return { stdout: 'rustdoc 1.98.1 (test 2026-09-01)\n' };
    assert.equal(file, cargo);
    assert.deepEqual(args, ['test']);
    return { stdout: '' };
  };

  await runRustCommand(['test'], {
    cwd: workingDirectory, environment: { HOME: home, PATH: '' }, run,
  });
  assert.deepEqual(
    calls.filter(call => call.file === rustup).map(call => call.cwd),
    [workingDirectory, workingDirectory, workingDirectory, workingDirectory],
  );
  assert.equal(calls.at(-1).cwd, workingDirectory);
});

test('Rust commands reject a symbolic working directory', {
  skip: process.platform === 'win32',
}, async t => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'crudui-rust-link-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'crate');
  const workingDirectory = path.join(directory, 'linked-crate');
  const toolchain = path.join(directory, 'toolchain');
  await Promise.all([mkdir(target), mkdir(toolchain)]);
  await symlink(target, workingDirectory);
  const cargo = path.join(toolchain, 'cargo');
  const rustc = path.join(toolchain, 'rustc');
  const rustdoc = path.join(toolchain, 'rustdoc');
  await Promise.all([cargo, rustc, rustdoc].map(writeExecutable));
  const run = async (file, args) => {
    if (file === cargo) return { stdout: 'cargo 1.98.1\n' };
    if (file === rustc) {
      return { stdout: 'rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n' };
    }
    if (file === rustdoc) return { stdout: 'rustdoc 1.98.1 (test 2026-09-01)\n' };
    throw new Error('Unexpected command: ' + file + ' ' + args.join(' '));
  };

  await assert.rejects(runRustCommand(['test'], {
    cargo, cwd: workingDirectory, environment: { PATH: '' }, run, rustc, rustdoc,
  }), /symbolic link/i);
});
