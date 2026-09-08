import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

for (const target of ['ts', 'go', 'rust', 'php']) {
  for (const failure of ['tool-failure', 'missing-output']) {
    test(`${target} rejects ${failure}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'crudui-api-docs-'));
      try {
        for (const path of ['scripts', 'bin', 'node_modules/.bin', 'tools/bin',
          'packages/validator-go', 'packages/validator-rust']) {
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
          encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin') },
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
