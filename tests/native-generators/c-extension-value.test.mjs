import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('C extension value model preserves order and owns independent values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-value-'));
  try {
    const executable = path.join(directory, 'value-test');
    const compiler = process.env.CC ?? 'cc';
    const compile = spawnSync(compiler, [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      '-I', path.join(root, 'packages/php-ext/native'),
      path.join(root, 'packages/php-ext/native/value.c'),
      path.join(root, 'packages/php-ext/tests/value.c'),
      '-o', executable,
    ], { encoding: 'utf8' });
    assert.equal(compile.error, undefined);
    assert.equal(compile.signal, null);
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(run.error, undefined);
    assert.equal(run.signal, null);
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
