import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('C extension compiles composed form templates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-template-'));
  try {
    const executable = path.join(directory, 'template-test');
    const native = file => path.join(root, 'packages/php-ext/native', file);
    const compile = spawnSync(process.env.CC ?? 'cc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      '-I', path.join(root, 'packages/php-ext/native'),
      native('value.c'), native('engine_error.c'), native('compose.c'), native('template.c'),
      path.join(root, 'packages/php-ext/tests/template.c'), '-o', executable,
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
