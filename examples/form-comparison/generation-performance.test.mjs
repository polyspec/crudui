import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

function regularTemporaryRoot() {
  const root = realpathSync(tmpdir());
  assert.ok(path.isAbsolute(root), 'The operating system temporary path must be absolute');
  assert.equal(path.normalize(root), root,
    'The operating system temporary path must be normalized');
  const parsed = path.parse(root);
  let current = parsed.root;
  for (const component of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const state = lstatSync(current);
    assert.equal(state.isSymbolicLink(), false,
      'The operating system temporary path must not contain symbolic links');
    assert.equal(state.isDirectory(), true,
      'The operating system temporary path must contain only directories');
  }
  return root;
}

function composerCandidate(t, record) {
  const root = mkdtempSync(path.join(regularTemporaryRoot(), 'crudui-form-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const generatorSource = path.join(root, 'packages/generator-php/src');
  const vendor = path.join(root, 'packages/generator-php/vendor');
  const composer = path.join(vendor, 'composer');
  const installedValidator = path.join(vendor, 'crudui/validator/src/Public');
  const validatorSource = path.join(root, 'packages/validator-php/src/Public');
  for (const directory of [generatorSource, composer, installedValidator, validatorSource]) {
    mkdirSync(directory, { recursive: true });
  }
  for (const filename of ['Generator.php', 'Form.php']) {
    copyFileSync(
      path.join(library, 'packages/generator-php/src', filename),
      path.join(generatorSource, filename),
    );
  }
  const validator = readFileSync(
    path.join(library, 'packages/validator-php/src/Public/Validator.php'),
  );
  writeFileSync(path.join(validatorSource, 'Validator.php'), validator);
  writeFileSync(path.join(installedValidator, 'Validator.php'), validator);
  writeFileSync(path.join(vendor, 'autoload.php'), `<?php
namespace Composer\\Autoload;
final class ClassLoader
{
    public function __construct(private string $vendor) {}
    public function register(): void { spl_autoload_register([$this, 'loadClass']); }
    public function loadClass(string $class): void
    {
        $files = [
            'CRUDUI\\Generator' => dirname($this->vendor) . '/src/Generator.php',
            'CRUDUI\\Form' => dirname($this->vendor) . '/src/Form.php',
            'CRUDUI\\Validator' => $this->vendor . '/crudui/validator/src/Public/Validator.php',
        ];
        if (isset($files[$class])) require $files[$class];
    }
}
$loader = new ClassLoader(__DIR__);
$loader->register();
return $loader;
`);
  writeComposerRecord(composer, record, path.resolve(installedValidator, '../..'));
  return { root, installedValidator: path.join(installedValidator, 'Validator.php') };
}

function writeComposerRecord(composer, record, installDirectory) {
  let packageRecord = '';
  if (record === 'valid') {
    packageRecord = `'crudui/validator' => ['install_path' => ${JSON.stringify(installDirectory)}],`;
  } else if (record === 'malformed') {
    packageRecord = `'crudui/validator' => ['install_path' => null],`;
  }
  writeFileSync(path.join(composer, 'installed.php'), `<?php
return ['versions' => [${packageRecord}]];
`);
}

function constructFrom(root) {
  return php('new FormGeneration("php",' + JSON.stringify(root) + ',$source,null);');
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

test('uses the Composer-installed validator copy from the build tree', () => {
  const result = php([
    '$generation=new FormGeneration("php",', JSON.stringify(library), ',$source,null);',
    'echo json_encode(["generator"=>$generation->provenance(),',
    '"validatorInstall"=>realpath(Composer\\InstalledVersions::getInstallPath("crudui/validator"))],JSON_THROW_ON_ERROR);',
  ].join(''));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  const report = JSON.parse(result.stdout);
  const installedFile = report.generator.classes['CRUDUI\\Validator'].file;
  assert.equal(installedFile, path.join(report.validatorInstall, 'src/Public/Validator.php'));
  assert.deepEqual(
    readFileSync(installedFile),
    readFileSync(path.join(library, 'packages/validator-php/src/Public/Validator.php')),
  );
});

test('rejects a missing Composer validator package record', t => {
  const candidate = composerCandidate(t, 'missing');
  const result = constructFrom(candidate.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Missing Composer package record: crudui\/validator/);
});

test('rejects a malformed Composer validator package record', t => {
  const candidate = composerCandidate(t, 'malformed');
  const result = constructFrom(candidate.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Malformed Composer package record: crudui\/validator/);
});

test('uses the selected generator record with another Composer installation', () => {
  const result = php([
    'require ', JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php')), ';',
    'class_exists(CRUDUI\\Generator::class);class_exists(CRUDUI\\Form::class);',
    'class_exists(CRUDUI\\Validator::class);',
    'require ', JSON.stringify(path.join(library, 'packages/validator-php/vendor/autoload.php')), ';',
    'new FormGeneration("php",', JSON.stringify(library), ',$source,null);echo "ok\\n";',
  ].join(''));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.equal(result.stdout, 'ok\n');
});

test('rejects a Composer validator package outside the candidate vendor directory', t => {
  const candidate = composerCandidate(t, 'valid');
  const composer = path.join(
    candidate.root, 'packages/generator-php/vendor/composer',
  );
  writeComposerRecord(
    composer, 'valid', path.join(candidate.root, 'packages/validator-php'),
  );
  const result = constructFrom(candidate.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /outside the candidate vendor directory/);
});

test('rejects an installed validator file that differs from the candidate source', t => {
  const candidate = composerCandidate(t, 'valid');
  writeFileSync(candidate.installedValidator, Buffer.concat([
    readFileSync(candidate.installedValidator), Buffer.from('\n// changed\n'),
  ]));
  const result = constructFrom(candidate.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Installed CRUDUI source differs from the candidate/);
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

test('constructs request generators without deployment-size work', () => {
  const body = [
    '$start=hrtime(true);',
    'for($index=0;$index<500;$index++)new FormGeneration("php",',
    JSON.stringify(library),
    ',$source,null);',
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
