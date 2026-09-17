import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

function copy(root, relative) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(repository, relative), target);
}

function executable(filename, source) {
  writeFileSync(filename, `#!${process.execPath}\n${source}\n`, { mode: 0o755 });
}

function fixture(t, name, files, directories = []) {
  const temporaryRoot = realpathSync(os.tmpdir());
  const root = mkdtempSync(path.join(temporaryRoot, name));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of directories) mkdirSync(path.join(root, directory), { recursive: true });
  for (const file of [...files, 'scripts/run-rust-command.mjs', 'scripts/tool-resolution.mjs']) {
    copy(root, file);
  }
  return root;
}

function rustEnvironment(root, additions = {}) {
  const home = path.join(root, 'home');
  const rustupDirectory = path.join(home, '.cargo', 'bin');
  const toolchain = path.join(root, 'toolchain');
  const commandDirectory = path.join(root, 'commands');
  const commandLog = path.join(root, 'rust-commands.jsonl');
  mkdirSync(rustupDirectory, { recursive: true });
  mkdirSync(toolchain);
  mkdirSync(commandDirectory);

  const cargo = path.join(toolchain, 'cargo');
  const rustc = path.join(toolchain, 'rustc');
  const rustdoc = path.join(toolchain, 'rustdoc');
  executable(path.join(rustupDirectory, 'rustup'), String.raw`
const name = process.argv[2];
if (name === '--version') process.stdout.write('rustup 1.29.0\n');
else if (name === 'which') {
  const tools = { cargo: process.env.TEST_CARGO, rustc: process.env.TEST_RUSTC, rustdoc: process.env.TEST_RUSTDOC };
  if (!tools[process.argv[3]]) process.exit(2);
  process.stdout.write(tools[process.argv[3]] + '\n');
} else process.exit(2);
`);
  executable(cargo, String.raw`
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('cargo 1.98.1\n');
  process.exit(0);
}
fs.appendFileSync(process.env.RUST_COMMAND_LOG, JSON.stringify({
  args, cwd: process.cwd(), rustc: process.env.RUSTC, rustdoc: process.env.RUSTDOC,
}) + '\n');
if (process.env.TEST_RUSTDOC_OUTPUT) {
  for (const crate of ['crudui_validator', 'crudui_generator']) {
    const directory = path.join(process.env.TEST_RUSTDOC_OUTPUT, crate);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), crate + '\n');
  }
}
if (args[0] === 'run') {
  for (const spec of ['contact', 'large']) {
    process.stdout.write(JSON.stringify({
      spec, valid: true, error: null, field: null, opsSec: 1, avgUs: 1, ms: 1,
    }) + '\n');
  }
}
`);
  executable(rustc, String.raw`
process.stdout.write('rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n');
`);
  executable(rustdoc, String.raw`
process.stdout.write('rustdoc 1.98.1 (test 2026-09-01)\n');
`);

  const environment = {
    ...process.env,
    HOME: home,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: commandDirectory,
    RUST_COMMAND_LOG: commandLog,
    TEST_CARGO: cargo,
    TEST_RUSTC: rustc,
    TEST_RUSTDOC: rustdoc,
    ...additions,
  };
  delete environment.CARGO;
  delete environment.RUSTC;
  delete environment.RUSTDOC;
  return { cargo, commandLog, environment, rustc, rustdoc };
}

function commands(filename) {
  return readFileSync(filename, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

test('Rust documentation coverage uses one resolved toolchain', t => {
  const root = fixture(t, 'crudui-rust-doc-coverage-', [
    'scripts/check-doc-coverage.mjs',
  ], [
    'packages/validator-rust',
    'packages/generator-rust',
  ]);
  const tools = rustEnvironment(root);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-doc-coverage.mjs'), 'rust'], {
    encoding: 'utf8',
    env: tools.environment,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(commands(tools.commandLog), [
    {
      args: ['build', '--locked', '--lib'],
      cwd: path.join(root, 'packages/validator-rust'),
      rustc: tools.rustc,
      rustdoc: tools.rustdoc,
    },
    {
      args: ['build', '--locked', '--lib'],
      cwd: path.join(root, 'packages/generator-rust'),
      rustc: tools.rustc,
      rustdoc: tools.rustdoc,
    },
  ]);
});

test('Rust API generation uses one resolved toolchain', t => {
  const root = fixture(t, 'crudui-rust-api-', [
    'scripts/gen-api-docs.mjs',
  ], [
    'docs/api',
    'docs/public/api',
    'packages/generator-rust',
    'packages/validator-rust',
  ]);
  const generated = path.join(root, 'packages/generator-rust/target/doc');
  const tools = rustEnvironment(root, { TEST_RUSTDOC_OUTPUT: generated });
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/gen-api-docs.mjs'), 'rust'], {
    encoding: 'utf8',
    env: tools.environment,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(commands(tools.commandLog), [{
    args: [
      'doc', '--locked', '--no-deps', '-p', 'crudui-validator', '-p', 'crudui-generator',
    ],
    cwd: path.join(root, 'packages/generator-rust'),
    rustc: tools.rustc,
    rustdoc: tools.rustdoc,
  }]);
});

test('Rust benchmark uses one resolved toolchain for execution and version metadata', t => {
  const root = fixture(t, 'crudui-rust-benchmark-', [
    'tools/bench/run.js',
  ], [
    'tools/bench/fixtures',
    'tools/bench/rust',
  ]);
  writeFileSync(path.join(root, 'tools/bench/fixtures/contact.spec.json'), '{}\n');
  const tools = rustEnvironment(root);
  const result = spawnSync(process.execPath, [
    path.join(root, 'tools/bench/run.js'),
    '--only', 'rust', '--iters', '1', '--warmup', '0',
  ], {
    encoding: 'utf8',
    env: tools.environment,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(commands(tools.commandLog), [{
    args: [
      'run', '--release', '--quiet', '--', '--fixtures',
      path.join(root, 'tools/bench/fixtures'), '--iters', '1', '--warmup', '0',
    ],
    cwd: path.join(root, 'tools/bench/rust'),
    rustc: tools.rustc,
    rustdoc: tools.rustdoc,
  }]);
  assert.match(readFileSync(path.join(root, 'tools/bench/results.md'), 'utf8'), /cargo 1\.98\.1/);
});

test('Rust generator fixture validation uses one resolved toolchain', t => {
  const root = fixture(t, 'crudui-rust-generator-fixtures-', []);
  const tools = rustEnvironment(root);
  const result = spawnSync(process.execPath, [
    path.join(repository, 'packages/generator-rust/verify-fixtures.mjs'),
  ], {
    cwd: repository,
    encoding: 'utf8',
    env: tools.environment,
  });

  assert.notEqual(result.status, 0, 'The fixture output mock intentionally omits its result');
  assert.doesNotMatch(result.stdout + result.stderr, /spawnSync cargo ENOENT/);
  assert.deepEqual(commands(tools.commandLog), [{
    args: [
      'test', '--locked', '--manifest-path',
      path.join(repository, 'packages/generator-rust/Cargo.toml'), 'native_fixture_records',
    ],
    cwd: repository,
    rustc: tools.rustc,
    rustdoc: tools.rustdoc,
  }]);
});

test('native generator integration uses the shared Rust command entry point', () => {
  const source = readFileSync(path.join(repository, 'tests/native-generators/run.mjs'), 'utf8');
  assert.match(source, /runRustCommand/);
  assert.doesNotMatch(source, /process\.env\.CARGO|globalThis\.process\.env\.CARGO/);
});

test('cross-check server builds Rust through its module-located entry point', t => {
  const manifest = JSON.parse(readFileSync(
    path.join(repository, 'examples/cross-check-console/server/package.json'), 'utf8',
  ));
  assert.equal(manifest.scripts['build:rust'], 'node build-rust.mjs');

  const root = fixture(t, 'crudui-rust-cross-check-', []);
  const tools = rustEnvironment(root);
  const result = spawnSync(process.execPath, [
    path.join(repository, 'examples/cross-check-console/server/build-rust.mjs'),
  ], {
    cwd: path.join(repository, 'examples/cross-check-console/server'),
    encoding: 'utf8',
    env: tools.environment,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(commands(tools.commandLog), [{
    args: ['build', '--locked', '--release'],
    cwd: path.join(repository, 'examples/cross-check-console/validators/rust'),
    rustc: tools.rustc,
    rustdoc: tools.rustdoc,
  }]);
});
