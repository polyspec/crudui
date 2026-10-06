// The package names of the polyspec repositories (docs/spec/package-build.md, "Package names"): npm packages are
// `@polyspec/crudui-<name>`, Composer packages `polyspec/crudui-<name>` with PHP namespaces under `Polyspec\Crudui\`,
// Rust crates `polyspec-crudui-<name>` with the library `polyspec_crudui_<name>`, and Go modules
// `github.com/polyspec/crudui/<path>`. No maintained file names a package by another form; the changelog, the
// checklist and the wave descriptions keep the names that their entries recorded.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

test('every package of packages/ has the name of the polyspec convention', () => {
  assert.equal(JSON.parse(read('package.json')).name, '@polyspec/crudui-workspace');
  const npm = Object.fromEntries(tracked.filter(file => /^packages\/[^/]+\/package\.json$/.test(file))
    .map(file => [file.split('/')[1], JSON.parse(read(file)).name]));
  assert.deepEqual(npm, {
    cli: '@polyspec/crudui-cli',
    'form-binding': '@polyspec/crudui-form-binding',
    'generator-core': '@polyspec/crudui-generator-core',
    'generator-html': '@polyspec/crudui-generator-html',
    'generator-react': '@polyspec/crudui-generator-react',
    'generator-svelte': '@polyspec/crudui-generator-svelte',
    'generator-vue': '@polyspec/crudui-generator-vue',
    'validator-ts': '@polyspec/crudui-validator',
  });

  for (const [directory, name] of [['validator-php', 'polyspec/crudui-validator'], ['generator-php', 'polyspec/crudui-generator']]) {
    const composer = JSON.parse(read(`packages/${directory}/composer.json`));
    assert.equal(composer.name, name);
    const prefixes = [...Object.keys(composer.autoload['psr-4']), ...Object.keys(composer['autoload-dev']?.['psr-4'] ?? {})];
    assert.deepEqual(prefixes.filter(prefix => !prefix.startsWith('Polyspec\\Crudui\\')), [], `${directory}: PSR-4 prefixes`);
  }
  const namespaces = [...read('packages/php-ext/crudui.stub.php').matchAll(/^namespace ([^ {;]+)/gm)].map(match => match[1]);
  assert.ok(namespaces.length > 0);
  assert.deepEqual(namespaces.filter(name => name !== 'Polyspec\\Crudui' && !name.startsWith('Polyspec\\Crudui\\')), []);

  for (const [directory, name] of [['validator-rust', 'polyspec-crudui-validator'], ['generator-rust', 'polyspec-crudui-generator']]) {
    const manifest = read(`packages/${directory}/Cargo.toml`);
    assert.equal(/^\[package\]\nname = "([^"]+)"/m.exec(manifest)?.[1], name, directory);
    const library = /^\[lib\]\nname = "([^"]+)"/m.exec(manifest)?.[1];
    if (library) assert.equal(library, name.replaceAll('-', '_'), directory);
  }

  for (const directory of ['validator-go', 'generator-go']) {
    assert.equal(/^module (\S+)$/m.exec(read(`packages/${directory}/go.mod`))?.[1], `github.com/polyspec/crudui/packages/${directory}`);
  }
});

// The forms of the names before the convention. A C identifier of the extension (crudui_validator_ce) is not a
// package name.
const OLD_NAMES = [
  ['npm scope @crudui', /@crudui\//g],
  ['PHP namespace CRUDUI', /\bCRUDUI\\/g],
  ['Composer package crudui/', /(?<![@\w])crudui\\?\/(?:validator|generator)\b/g],
  ['Rust crate crudui-', /(?<![\w/-])crudui-(?:validator|generator)\b/g],
  ['Rust library crudui_', /(?<!\w)crudui_(?:validator|generator)(?!_ce)\b/g],
];
const RECORDS = new Set(['CHANGELOG.md', 'CHANGELOG.ko.md', 'docs/plans/execution-checklist.md', 'docs/plans/execution-checklist.ko.md', 'docs/plans/waves.md', 'docs/plans/waves.ko.md']);

test('no maintained file names a package by a form before the convention', () => {
  const failures = [];
  for (const file of tracked) {
    if (RECORDS.has(file) || file === 'tests/build/package-names.test.mjs') continue;
    let text;
    try {
      text = read(file);
    } catch (cause) {
      if (cause.code === 'ENOENT') continue;
      throw cause;
    }
    if (text.includes('\0')) continue;
    for (const [label, pattern] of OLD_NAMES) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        failures.push(`${file}:${line}: ${label}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(failures.slice(0, 40), [], `${failures.length} names before the convention:\n${failures.slice(0, 40).join('\n')}`);
});
