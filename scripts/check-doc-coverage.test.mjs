import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');

function environment(operation) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crudui-doc-check-')));
  try {
    for (const relative of ['scripts', 'bin', 'node_modules/.bin', 'packages/validator-go', 'packages/generator-go', 'packages/validator-rust', 'packages/generator-rust']) mkdirSync(join(root, relative), { recursive: true });
    copyFileSync(new URL('./check-doc-coverage.mjs', import.meta.url), join(root, 'scripts/check-doc-coverage.mjs'));
    return operation(root);
  } finally { rmSync(root, { recursive: true }); }
}
function mock(root, command, status = 0) {
  const file = command === 'typedoc' ? 'node_modules/.bin/typedoc' : `bin/${command}`;
  writeFileSync(join(root, file), `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.CHECK_LOG, JSON.stringify({command:${JSON.stringify(command)}, cwd:process.cwd(), args:process.argv.slice(2)})+'\\n');process.exit(${status});\n`, { mode: 0o755 });
}
function run(root, target) {
  const env = { ...process.env, PATH: join(root, 'bin'), CHECK_LOG: join(root, 'calls.jsonl') };
  delete env.GO; delete env.CARGO; delete env.PHP;
  return spawnSync(process.execPath, [join(root, 'scripts/check-doc-coverage.mjs'), target], { encoding: 'utf8', env });
}
for (const [target, command] of [['go', 'go'], ['rust', 'cargo'], ['php', 'php']]) {
  test(`${target} fails when its required tool is missing`, () => environment(root => {
    const result = run(root, target);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /0 passed/);
    assert.ok(!result.stdout.includes('SKIP'));
  }));
  test(`${target} fails on a tool failure`, () => environment(root => {
    mock(root, command, 17);
    assert.equal(run(root, target).status, 1);
  }));
  test(`${target} checks both current packages`, () => environment(root => {
    mock(root, command);
    const result = run(root, target);
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    if (target === 'php') {
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].args, [join(root, 'scripts/php-doc-coverage.php')]);
    } else {
      assert.deepEqual(calls.map(call => call.cwd), ['validator', 'generator'].map(kind => join(root, 'packages', `${kind}-${target}`)));
    }
  }));
}
test('TypeScript checks all five current public entries', () => environment(root => {
  mock(root, 'npm'); mock(root, 'typedoc');
  const result = run(root, 'ts');
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls.slice(1).map(call => call.args.at(-1)), ['generator-core', 'validator-ts', 'generator-react', 'generator-vue', 'generator-svelte'].map(pkg => join(root, 'packages', pkg, pkg === 'generator-svelte' ? 'dist/index.d.ts' : 'src/index.ts')));
}));
test('TypeScript rejects a public declaration that references an unexported type', () => {
  const result = spawnSync(join(repository, 'node_modules/.bin/typedoc'), [
    '--options', join(repository, 'scripts/typedoc.check.json'),
    '--tsconfig', join(repository, 'scripts/fixtures/typedoc/tsconfig.json'),
    '--entryPointStrategy', 'resolve',
    join(repository, 'scripts/fixtures/typedoc/unexported.ts'),
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /HiddenInput.*not included in the documentation/);
});
test('unknown doc coverage target fails', () => environment(root => {
  assert.notEqual(run(root, 'unknown').status, 0);
}));
