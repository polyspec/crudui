import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const library = path.resolve(directory, '../..');
const generation = path.join(directory, 'generation.php');
const commit = 'a'.repeat(40);
const archiveSha256 = 'b'.repeat(64);

function script(body) {
  return [
    'require ' + JSON.stringify(generation) + ';',
    '$source=(object)["commit"=>' + JSON.stringify(commit) + ',"archiveSha256"=>' + JSON.stringify(archiveSha256) + '];',
    body,
  ].join('');
}

function php(body) {
  return spawnSync('php', ['-n', '-r', script(body)], {
    cwd: directory,
    env: { ...process.env, FORM_PHP_SERVER: 'php' },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('constructs a verified generator without deployment file paths', () => {
  const result = php(
    '$generation=new FormGeneration("php",' + JSON.stringify(library)
      + ',$source,' + JSON.stringify(archiveSha256) + ',null);echo "ok\\n";',
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.equal(result.stdout, 'ok\n');
});

test('request construction does not read or hash deployment files', () => {
  const source = readFileSync(generation, 'utf8');
  assert.doesNotMatch(source, /hash_file\s*\(/);
  assert.doesNotMatch(source, /file_get_contents\s*\(\s*\$[^)]*(archive|module)/i);
});

test('rejects an unverified source digest', () => {
  const result = php(
    'new FormGeneration("php",' + JSON.stringify(library)
      + ',$source,' + JSON.stringify('0'.repeat(64)) + ',null);',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /source archive hash does not match/);
});

test('constructs request generators without deployment-size work', () => {
  const body = [
    '$start=hrtime(true);',
    'for($index=0;$index<500;$index++)new FormGeneration("php",',
    JSON.stringify(library),
    ',$source,',
    JSON.stringify(archiveSha256),
    ',null);',
    'echo (hrtime(true)-$start),"\\n";',
  ].join('');
  const result = php(body);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  const nanoseconds = Number(result.stdout.trim());
  assert.ok(Number.isSafeInteger(nanoseconds) && nanoseconds < 250_000_000,
    '500 constructors took ' + nanoseconds / 1e6 + ' ms');
});
