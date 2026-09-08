const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
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
