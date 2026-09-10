import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const target of ['ts', 'go', 'rust', 'php']) {
  for (const failure of ['tool-failure', 'missing-output']) {
    test(`${target} rejects ${failure}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'crudui-api-docs-'));
      try {
        for (const path of ['scripts', 'bin', 'node_modules/.bin', 'tools/bin',
          'packages/validator-go', 'packages/validator-rust', 'packages/generator-go', 'packages/generator-rust']) {
          mkdirSync(join(root, path), { recursive: true });
        }
        copyFileSync(new URL('./gen-api-docs.mjs', import.meta.url), join(root, 'scripts/gen-api-docs.mjs'));
        writeFileSync(join(root, 'tools/bin/phpDocumentor.phar'), '');
        const script = `#!/bin/sh\nexit ${failure === 'tool-failure' ? 27 : 0}\n`;
        for (const command of ['npm', 'go', 'cargo', 'php']) {
          writeFileSync(join(root, 'bin', command), script, { mode: 0o755 });
        }
        writeFileSync(join(root, 'node_modules/.bin/typedoc'), script, { mode: 0o755 });
        const result = spawnSync(process.execPath, [join(root, 'scripts/gen-api-docs.mjs'), target], {
          encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin'), GO: 'go', CARGO: 'cargo', PHP: 'php' },
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
