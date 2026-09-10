import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('uses the Composer-installed validator copy from the candidate source', () => {
  const result = php([
    '$generation=new FormGeneration("php",', JSON.stringify(library),
    ',$source,', JSON.stringify(archiveSha256), ',null);',
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

test('rejects a missing Composer validator package record', () => {
  const fakeVendor = path.join(library, '.git/missing-composer-record');
  const result = php([
    'require ', JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php')), ';',
    'class_exists(CRUDUI\\Generator::class);class_exists(CRUDUI\\Form::class);',
    'class_exists(CRUDUI\\Validator::class);',
    '$installed=Composer\\InstalledVersions::getRawData();',
    'foreach(Composer\\Autoload\\ClassLoader::getRegisteredLoaders() as $loader)$loader->unregister();',
    '$loader=new Composer\\Autoload\\ClassLoader(', JSON.stringify(fakeVendor), ');$loader->register();',
    'unset($installed["versions"]["crudui/validator"]);',
    'Composer\\InstalledVersions::reload($installed);',
    'new FormGeneration("php",', JSON.stringify(library),
    ',$source,', JSON.stringify(archiveSha256), ',null);',
  ].join(''));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Missing Composer package record: crudui\/validator/);
});

test('uses the selected generator record with another Composer installation', () => {
  const result = php([
    'require ', JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php')), ';',
    'class_exists(CRUDUI\\Generator::class);class_exists(CRUDUI\\Form::class);',
    'class_exists(CRUDUI\\Validator::class);',
    'require ', JSON.stringify(path.join(library, 'packages/validator-php/vendor/autoload.php')), ';',
    'new FormGeneration("php",', JSON.stringify(library),
    ',$source,', JSON.stringify(archiveSha256), ',null);echo "ok\\n";',
  ].join(''));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.equal(result.stdout, 'ok\n');
});

test('rejects a Composer validator package outside the candidate vendor directory', () => {
  const result = php([
    'require ', JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php')), ';',
    'class_exists(CRUDUI\\Generator::class);class_exists(CRUDUI\\Form::class);',
    'class_exists(CRUDUI\\Validator::class);',
    '$installed=Composer\\InstalledVersions::getRawData();',
    'foreach(Composer\\Autoload\\ClassLoader::getRegisteredLoaders() as $loader)$loader->unregister();',
    '$loader=new Composer\\Autoload\\ClassLoader(', JSON.stringify(path.join(library, '.git/outside-vendor')), ');$loader->register();',
    '$installed["versions"]["crudui/validator"]["install_path"]=',
    JSON.stringify(path.join(library, 'packages/validator-php')), ';',
    'Composer\\InstalledVersions::reload($installed);',
    'new FormGeneration("php",', JSON.stringify(library),
    ',$source,', JSON.stringify(archiveSha256), ',null);',
  ].join(''));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /outside the candidate vendor directory/);
});

test('rejects an installed validator file that differs from the candidate source', () => {
  const temporary = mkdtempSync(path.join(
    library, 'packages/generator-php/vendor/.crudui-validator-copy-',
  ));
  const installDirectory = path.join(temporary, 'validator');
  mkdirSync(path.join(installDirectory, 'src/Public'), { recursive: true });
  writeFileSync(path.join(installDirectory, 'src/Public/Validator.php'), '<?php\n');
  try {
    const result = php([
      'require ', JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php')), ';',
      'class_exists(CRUDUI\\Generator::class);class_exists(CRUDUI\\Form::class);',
      'class_exists(CRUDUI\\Validator::class);',
      '$installed=Composer\\InstalledVersions::getRawData();',
      'foreach(Composer\\Autoload\\ClassLoader::getRegisteredLoaders() as $loader)$loader->unregister();',
      '$loader=new Composer\\Autoload\\ClassLoader(', JSON.stringify(path.join(temporary, 'vendor')), ');$loader->register();',
      '$installed["versions"]["crudui/validator"]["install_path"]=',
      JSON.stringify(installDirectory), ';',
      'Composer\\InstalledVersions::reload($installed);',
      'new FormGeneration("php",', JSON.stringify(library),
      ',$source,', JSON.stringify(archiveSha256), ',null);',
    ].join(''));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Installed CRUDUI source differs from the candidate/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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
