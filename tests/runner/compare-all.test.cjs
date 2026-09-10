const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

for (const mode of ['failure', 'wrong-result']) {
  test(`comparison rejects PHP ${mode}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'crudui-comparison-failure-'));
    try {
      const script = mode === 'failure' ? 'exit 12' : "printf '%s' '{\"valid\":true}'";
      writeFileSync(join(directory, 'php'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
      const result = spawnSync(process.execPath, [resolve(__dirname, 'compare-all.js'),
        '--php-only', '--file', 'required.json'], {
        encoding: 'utf8', env: { ...process.env, PATH: directory },
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(!result.stdout.includes('IDEMPOTENCY VERIFIED'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('comparison resolves Rust tools from one Rustup toolchain record', () => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'crudui-comparison-rustup-'));
  try {
    const home = join(directory, 'home');
    const cargoHome = join(home, '.cargo');
    const rustupBin = join(cargoHome, 'bin');
    const toolchain = join(directory, 'toolchain');
    const commandLog = join(directory, 'commands.log');
    mkdirSync(rustupBin, { recursive: true });
    mkdirSync(toolchain);
    const cargo = join(toolchain, 'cargo');
    const rustc = join(toolchain, 'rustc');
    const rustdoc = join(toolchain, 'rustdoc');
    writeFileSync(join(rustupBin, 'rustup'), [
      '#!/bin/sh',
      'if [ "$PWD" != "$TEST_RUST_CWD" ]; then exit 31; fi',
      'if [ "$1" = "--version" ]; then printf "rustup 1.29.0\n"; exit 0; fi',
      `if [ "$1" = "which" ] && [ "$2" = "cargo" ]; then printf '%s\n' '${cargo}'; exit 0; fi`,
      `if [ "$1" = "which" ] && [ "$2" = "rustc" ]; then printf '%s\n' '${rustc}'; exit 0; fi`,
      `if [ "$1" = "which" ] && [ "$2" = "rustdoc" ]; then printf '%s\n' '${rustdoc}'; exit 0; fi`,
      'exit 2',
      '',
    ].join('\n'), { mode: 0o755 });
    writeFileSync(cargo, [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then printf "cargo 1.98.1\n"; exit 0; fi',
      `printf '%s\t%s\t%s\n' "$*" "$RUSTC" "$RUSTDOC" > '${commandLog}'`,
      'exit 23',
      '',
    ].join('\n'), { mode: 0o755 });
    writeFileSync(rustc, [
      '#!/bin/sh',
      'printf "rustc 1.98.1 (test 2026-09-01)\nhost: aarch64-test-system\n"',
      '',
    ].join('\n'), { mode: 0o755 });
    writeFileSync(rustdoc, [
      '#!/bin/sh',
      'printf "rustdoc 1.98.1 (test 2026-09-01)\n"',
      '',
    ].join('\n'), { mode: 0o755 });

    const result = spawnSync(process.execPath, [resolve(__dirname, 'compare-all.js'),
      '--rust-only', '--file', 'required.json'], {
      encoding: 'utf8',
      env: {
        HOME: home, LANG: 'C', LC_ALL: 'C', PATH: directory,
        TEST_RUST_CWD: resolve(__dirname, '../../packages/validator-rust'),
      },
    });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(existsSync(commandLog), true, result.stdout + result.stderr);
    assert.equal(readFileSync(commandLog, 'utf8'),
      `build --locked --release --bin validate-legacy\t${rustc}\t${rustdoc}\n`);
    assert.doesNotMatch(result.stdout + result.stderr, /spawnSync cargo ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
