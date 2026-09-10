import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');

function mockRust(root, status) {
  const cargo = join(root, 'bin/cargo-tool');
  const rustc = join(root, 'bin/rustc-tool');
  const rustdoc = join(root, 'bin/rustdoc-tool');
  writeFileSync(cargo, `#!${process.execPath}\n`
    + `if (process.argv[2] === '--version') process.stdout.write('cargo 1.98.1\\n');\n`
    + `else process.exit(${status});\n`, { mode: 0o755 });
  writeFileSync(rustc, `#!${process.execPath}\n`
    + `process.stdout.write('rustc 1.98.1 (test 2026-09-01)\\n`
    + `host: aarch64-test-system\\n');\n`, { mode: 0o755 });
  writeFileSync(rustdoc, `#!${process.execPath}\n`
    + `process.stdout.write('rustdoc 1.98.1 (test 2026-09-01)\\n');\n`, { mode: 0o755 });
  return { CARGO: cargo, RUSTC: rustc, RUSTDOC: rustdoc };
}

for (const target of ['ts', 'go', 'rust', 'php']) {
  for (const failure of ['tool-failure', 'missing-output']) {
    test(`${target} rejects ${failure}`, () => {
      const root = mkdtempSync(join(realpathSync(tmpdir()), 'crudui-api-docs-'));
      try {
        for (const path of ['scripts', 'bin', 'node_modules/.bin', 'tools/bin',
          'packages/validator-go', 'packages/validator-rust', 'packages/generator-go', 'packages/generator-rust']) {
          mkdirSync(join(root, path), { recursive: true });
        }
        for (const file of ['gen-api-docs.mjs', 'run-rust-command.mjs', 'tool-resolution.mjs']) {
          copyFileSync(new URL('./' + file, import.meta.url), join(root, 'scripts', file));
        }
        writeFileSync(join(root, 'tools/bin/phpDocumentor.phar'), '');
        const script = `#!/bin/sh\nexit ${failure === 'tool-failure' ? 27 : 0}\n`;
        for (const command of ['npm', 'go', 'php']) {
          writeFileSync(join(root, 'bin', command), script, { mode: 0o755 });
        }
        writeFileSync(join(root, 'node_modules/.bin/typedoc'), script, { mode: 0o755 });
        const rust = target === 'rust'
          ? mockRust(root, failure === 'tool-failure' ? 27 : 0)
          : {};
        const environment = {
          ...process.env, HOME: root, PATH: join(root, 'bin'), GO: 'go', PHP: 'php',
        };
        delete environment.CARGO; delete environment.RUSTC; delete environment.RUSTDOC;
        Object.assign(environment, rust);
        const result = spawnSync(process.execPath, [join(root, 'scripts/gen-api-docs.mjs'), target], {
          encoding: 'utf8', env: environment,
        });
        assert.notEqual(result.status, 0);
        assert.ok(!result.stdout.includes(': complete'));
        if (failure === 'missing-output') assert.match(result.stderr, /missing|empty/);
        else assert.match(result.stderr, /Command failed/);
      } finally {
        rmSync(root, { recursive: true });
      }
    });
  }
}

test('TypeScript API generation rejects an unexported public type', () => {
  const result = spawnSync(join(repository, 'node_modules/.bin/typedoc'), [
    '--options', join(repository, 'scripts/typedoc.base.json'),
    '--tsconfig', join(repository, 'scripts/fixtures/typedoc/tsconfig.json'),
    '--entryPointStrategy', 'resolve',
    '--emit', 'none',
    join(repository, 'scripts/fixtures/typedoc/unexported.ts'),
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /HiddenInput.*not included in the documentation/);
});
