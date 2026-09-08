import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const extension = process.argv[2];
assert.ok(extension?.startsWith('/'), 'An absolute PHP extension path is required');
function run(mode, args) {
  return spawnSync('php', args, { cwd: directory, env: { ...process.env, FORM_PHP_SERVER: mode }, encoding: 'utf8' });
}
for (const mode of ['php', 'php-ext']) {
  const args = mode === 'php-ext' ? ['-d', `extension=${extension}`] : [];
  const result = run(mode, [...args, 'test-json.php']);
  assert.equal(result.status, 0, `${mode}: ${result.stderr}\n${result.stdout}`);
  process.stdout.write(`${mode}: ${result.stdout}`);
}
const missing = run('php-ext', ['-r', 'require "json.php";']);
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /PHP extension state does not match/);
const unexpected = run('php', ['-d', `extension=${extension}`, '-r', 'require "json.php";']);
assert.notEqual(unexpected.status, 0);
assert.match(unexpected.stderr, /PHP extension state does not match/);
process.stdout.write('PHP processor mode enforcement passed\n');
