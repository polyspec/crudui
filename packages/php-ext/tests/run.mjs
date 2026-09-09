import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const extension = process.argv[2];
assert.ok(extension && extension.startsWith('/') && statSync(extension).isFile(), 'Provide an absolute CRUDUI extension path');
const autoload = resolve(root, 'packages/generator-php/vendor/autoload.php');

function php(script, native, composer) {
  const args = ['-n', ...(native ? ['-d', `extension=${extension}`] : []), resolve(root, 'packages/php-ext/tests', script), native ? 'native' : 'php', ...(composer ? [autoload] : [])];
  const result = spawnSync(process.env.PHP ?? 'php', args, { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, '', 'Unexpected PHP diagnostics');
  const report = JSON.parse(result.stdout);
  assert.equal(report.native, native);
  return report;
}

const pure = php('api.php', false, true);
for (const composer of [false, true]) {
  const native = php('api.php', true, composer);
  assert.deepEqual(native.signatures, pure.signatures, 'PHP signatures differ');
  assert.equal(native.checks, pure.checks);
}
const pureValidation = php('validate.php', false, true);
const nativeValidation = php('validate.php', true, false);
assert.deepEqual(nativeValidation.results, pureValidation.results, 'Native and PHP validation results differ');
console.log(`PHP API: ${pure.checks} checks in each of three configurations; validation: ${pureValidation.checks} cases in each implementation`);
