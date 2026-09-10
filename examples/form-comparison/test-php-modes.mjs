import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const [jsonExtension, cruduiExtension, library,
  archiveFile = '/archives/source.tar',
  metadataFile = '/workspace/metadata.json'] = process.argv.slice(2);
for (const [name, file] of Object.entries({ jsonExtension, cruduiExtension, library, archiveFile, metadataFile })) {
  assert.ok(file?.startsWith('/'), `An absolute ${name} path is required`);
}
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
const archiveSha256 = digest(archiveFile);
const moduleSha256 = digest(cruduiExtension);
assert.equal(archiveSha256, metadata.source.archiveSha256,
  'The deployed source archive differs from metadata');
const orderedJsonPhp = path.join(
  library, '.form-comparison/sources/ordered-json/php/src/OrderedJson.php',
);
function extensionArgs(name) {
  const result = spawnSync('php', ['-n', '-r', `exit(extension_loaded(${JSON.stringify(name)}) ? 0 : 1);`]);
  assert.equal(result.error, undefined, `Cannot inspect the ${name} extension`);
  assert.equal(result.signal, null, `PHP terminated while inspecting ${name}`);
  return result.status === 0 ? [] : ['-d', `extension=${name}`];
}
const commonExtensions = [...extensionArgs('mbstring'), ...extensionArgs('dom')];
const extensions = mode => mode === 'php-ext'
  ? [...commonExtensions, '-d', `extension=${jsonExtension}`, '-d', `extension=${cruduiExtension}`]
  : commonExtensions;
function run(mode, args) {
  return spawnSync('php', ['-n', ...args], {
    cwd: directory,
    env: { ...process.env, FORM_PHP_SERVER: mode,
      FORM_ORDERED_JSON_PHP_SOURCE: orderedJsonPhp },
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
const diagnostics = result => `${result.stderr}\n${result.stdout}`;
function success(mode, name, args) {
  const result = run(mode, args);
  assert.equal(result.error, undefined, `${mode}/${name}: ${result.error?.message}`);
  assert.equal(result.signal, null, `${mode}/${name}: terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${mode}/${name}: ${result.stderr}\n${result.stdout}`);
  process.stdout.write(`${mode}: ${result.stdout}`);
  return result;
}

const temporary = mkdtempSync(path.join(tmpdir(), 'crudui-php-modes-'));
try {
  const signaturesFile = path.join(temporary, 'signatures.json');
  const signatureScript = [
    'require $argv[1];',
    '$source=(object)["commit"=>str_repeat("a",40),"archiveSha256"=>$argv[3]];',
    '$generation=new FormGeneration("php",$argv[2],$source,$argv[3],null);',
    'echo json_encode($generation->provenance()["signatures"], JSON_THROW_ON_ERROR);',
  ].join('');
  const baseline = success('php', 'signature-baseline', [
    ...extensions('php'), '-r', signatureScript, '--', path.join(directory, 'generation.php'), library, archiveSha256,
  ]);
  writeFileSync(signaturesFile, baseline.stdout);

  for (const mode of ['php', 'php-ext']) {
    const args = extensions(mode);
    for (const script of ['test-json.php', 'test-repository.php']) success(mode, script, [...args, script]);
    success(mode, 'test-generation.php', [
      ...args, 'test-generation.php', library, mode, archiveFile,
      mode === 'php-ext' ? cruduiExtension : '-', archiveSha256, mode === 'php-ext' ? moduleSha256 : '-', signaturesFile,
    ]);
  }

  for (const [mode, args, expected] of [
    ['php-ext', commonExtensions, /OrderedJSON extension state does not match/],
    ['php-ext', [...commonExtensions, '-d', `extension=${jsonExtension}`], /CRUDUI extension state does not match/],
    ['php-ext', [...commonExtensions, '-d', `extension=${cruduiExtension}`], /OrderedJSON extension state does not match/],
    ['php', [...commonExtensions, '-d', `extension=${jsonExtension}`], /OrderedJSON extension state does not match/],
    ['php', [...commonExtensions, '-d', `extension=${cruduiExtension}`], /CRUDUI extension state does not match/],
  ]) {
    const result = run(mode, [...args, '-r', 'require "json.php";']);
    assert.notEqual(result.status, 0);
    assert.match(diagnostics(result), expected);
  }

  const constructScript = [
    'require $argv[1];',
    '$source=(object)["commit"=>str_repeat("a",40),"archiveSha256"=>$argv[3]];',
    '$module=$argv[5]==="-"?null:$argv[5];',
    'new FormGeneration($argv[2],$argv[4],$source,$argv[6],$module);',
  ].join('');
  for (const [name, mode, verifiedArchive, verifiedModule, expected] of [
    ['archive', 'php-ext', '0'.repeat(64), moduleSha256, /source archive hash does not match/],
    ['module', 'php-ext', archiveSha256, '-', /verified CRUDUI module hash is required/],
    ['pure-module', 'php', archiveSha256, moduleSha256, /must not declare a CRUDUI module hash/],
  ]) {
    const result = run(mode, [
      ...extensions(mode), '-r', constructScript, '--', path.join(directory, 'generation.php'), mode,
      archiveSha256, library, verifiedModule, verifiedArchive,
    ]);
    assert.notEqual(result.status, 0, `${name} mismatch must fail`);
    assert.match(diagnostics(result), expected);
  }
  const unexpectedAutoload = run('php-ext', [
    ...extensions('php-ext'), '-r',
    `require ${JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php'))}; require ${JSON.stringify(path.join(directory, 'generation.php'))}; $source=(object)["commit"=>str_repeat("a",40),"archiveSha256"=>${JSON.stringify(archiveSha256)}]; new FormGeneration("php-ext",${JSON.stringify(library)},$source,${JSON.stringify(archiveSha256)},${JSON.stringify(moduleSha256)});`,
  ]);
  assert.notEqual(unexpectedAutoload.status, 0, 'Native PHP with Composer must fail');
  assert.match(diagnostics(unexpectedAutoload), /Composer autoloader state does not match/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write('PHP generation, validation, JSON and processor mode enforcement passed\n');
