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
const changes = 'b'.repeat(64);

function script(body) {
  return [
    'require ' + JSON.stringify(generation) + ';',
    '$source=(object)["commit"=>' + JSON.stringify(commit) + ',"changes"=>' + JSON.stringify(changes) + '];',
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
      + ',$source,null);echo json_encode($generation->provenance()["source"]),"\\n";',
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { commit, changes });
});

test('loads the validator from its source directory', () => {
  const result = php([
    '$generation=new FormGeneration("php",', JSON.stringify(library), ',$source,null);',
    'echo json_encode($generation->provenance()["classes"],JSON_THROW_ON_ERROR);',
  ].join(''));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.equal(JSON.parse(result.stdout)['Polyspec\\Crudui\\Validator'].file,
    path.join(library, 'packages/validator/php/src/Public/Validator.php'));
});

test('request construction does not read or hash deployment files', () => {
  const source = readFileSync(generation, 'utf8');
  assert.doesNotMatch(source, /hash_file\s*\(/);
  assert.doesNotMatch(source, /file_get_contents\s*\(\s*\$[^)]*(archive|module)/i);
});

test('rejects an incomplete or malformed source identity', () => {
  for (const identity of [
    '(object)["commit"=>' + JSON.stringify(commit) + ']',
    '(object)["commit"=>' + JSON.stringify(commit) + ',"changes"=>"changed"]',
    '(object)["commit"=>"HEAD","changes"=>null]',
    '(object)["changes"=>null,"commit"=>' + JSON.stringify(commit) + ']',
  ]) {
    const result = php('new FormGeneration("php",' + JSON.stringify(library) + ',' + identity + ',null);');
    assert.notEqual(result.status, 0, identity);
    assert.match(result.stderr + result.stdout, /Invalid source identity/);
  }
});

// 500 constructors end within a second; constructors that did deployment-size work, such as
// reading the library tree, do not end before the 10-second limit of php(), which stops PHP and
// fails the test. The test reads no clock, so the load of the machine cannot change its result.
test('constructs request generators without deployment-size work', () => {
  const body = [
    'for($index=0;$index<500;$index++)new FormGeneration("php",',
    JSON.stringify(library),
    ',$source,null);',
    'echo "constructed\\n";',
  ].join('');
  const result = php(body);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null, '500 constructors did not end within the limit of php()');
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.equal(result.stdout, 'constructed\n');
});
