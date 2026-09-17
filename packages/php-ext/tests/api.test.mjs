// The PHP API of the extension against the pure PHP library: the same public signatures and
// checks in three configurations, and the same validation results.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const extension = resolve(root, process.env.PHP_EXTENSION ?? 'packages/php-ext/modules/crudui.so');
const autoload = resolve(root, 'packages/generator-php/vendor/autoload.php');
const phpBinary = process.env.PHP ?? 'php';

function mbstring() {
  const isolated = spawnSync(phpBinary, ['-n', '-r', 'exit(extension_loaded("mbstring") ? 0 : 1);']);
  assert.equal(isolated.error, undefined);
  assert.equal(isolated.signal, null);
  return isolated.status === 0 ? [] : ['-d', 'extension=mbstring'];
}

function php(script, native, composer) {
  assert.ok(statSync(extension).isFile(), `Build the extension first: ${extension}`);
  const args = [
    '-n',
    ...(composer ? mbstring() : []),
    ...(native ? ['-d', `extension=${extension}`] : []),
    resolve(root, 'packages/php-ext/tests', script),
    native ? 'native' : 'php',
    ...(composer ? [autoload] : []),
  ];
  const result = spawnSync(phpBinary, args, { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, '', 'Unexpected PHP diagnostics');
  const report = JSON.parse(result.stdout);
  assert.equal(report.native, native);
  return report;
}

for (const composer of [false, true]) {
  test(`the extension's PHP API equals the library's ${composer ? 'with' : 'without'} the Composer library loaded`, () => {
    const pure = php('api.php', false, true);
    const native = php('api.php', true, composer);
    assert.deepEqual(native.signatures, pure.signatures, 'PHP signatures differ');
    assert.equal(native.checks, pure.checks);
  });
}

test('the extension validates every validation fixture as the library does', () => {
  const pure = php('validate.php', false, true);
  const native = php('validate.php', true, false);
  assert.deepEqual(native.results, pure.results, 'Native and PHP validation results differ');
  assert.ok(pure.checks > 0);
});
