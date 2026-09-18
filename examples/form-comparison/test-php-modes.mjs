import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const usage = 'Usage: node test-php-modes.mjs /ordered_json.so /crudui.so /library';
assert.equal(process.argv.length, 5, usage);
const [jsonExtension, cruduiExtension, library] = process.argv.slice(2);
for (const [name, file] of Object.entries({ jsonExtension, cruduiExtension, library })) {
  assert.ok(path.isAbsolute(file), `An absolute ${name} path is required`);
}
const moduleSha256 = createHash('sha256').update(readFileSync(cruduiExtension)).digest('hex');
const source = '(object)["commit"=>str_repeat("a",40),"changes"=>null]';
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
    `$generation=new FormGeneration("php",$argv[2],${source},null);`,
    'echo json_encode($generation->provenance()["signatures"], JSON_THROW_ON_ERROR);',
  ].join('');
  const baseline = success('php', 'signature-baseline', [
    ...extensions('php'), '-r', signatureScript, '--', path.join(directory, 'generation.php'), library,
  ]);
  writeFileSync(signaturesFile, baseline.stdout);

  for (const mode of ['php', 'php-ext']) {
    const args = extensions(mode);
    for (const script of ['test-json.php', 'test-repository.php', 'test-form-shape.php', 'test-request-body.php']) success(mode, script, [...args, script]);
    success(mode, 'test-generation.php', [
      ...args, 'test-generation.php', library, mode,
      mode === 'php-ext' ? cruduiExtension : '-', mode === 'php-ext' ? moduleSha256 : '-', signaturesFile,
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
    '$module=$argv[4]==="-"?null:$argv[4];',
    '$source=json_decode($argv[5]);',
    'new FormGeneration($argv[2],$argv[3],$source,$module);',
  ].join('');
  const identity = JSON.stringify({ commit: 'a'.repeat(40), changes: null });
  for (const [name, mode, verifiedModule, sourceIdentity, expected] of [
    ['module', 'php-ext', '-', identity, /verified CRUDUI module hash is required/],
    ['pure-module', 'php', moduleSha256, identity, /must not declare a CRUDUI module hash/],
    ['source-changes', 'php', '-', JSON.stringify({ commit: 'a'.repeat(40), changes: 'b' }), /Invalid source identity/],
    ['source-fields', 'php', '-', JSON.stringify({ commit: 'a'.repeat(40) }), /Invalid source identity/],
  ]) {
    const result = run(mode, [
      ...extensions(mode), '-r', constructScript, '--', path.join(directory, 'generation.php'), mode,
      library, verifiedModule, sourceIdentity,
    ]);
    assert.notEqual(result.status, 0, `${name} mismatch must fail`);
    assert.match(diagnostics(result), expected);
  }
  const unexpectedAutoload = run('php-ext', [
    ...extensions('php-ext'), '-r',
    `require ${JSON.stringify(path.join(library, 'packages/generator-php/vendor/autoload.php'))}; require ${JSON.stringify(path.join(directory, 'generation.php'))}; new FormGeneration("php-ext",${JSON.stringify(library)},${source},${JSON.stringify(moduleSha256)});`,
  ]);
  assert.notEqual(unexpectedAutoload.status, 0, 'Native PHP with Composer must fail');
  assert.match(diagnostics(unexpectedAutoload), /Composer autoloader state does not match/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write('PHP generation, validation, JSON and processor mode enforcement passed\n');
