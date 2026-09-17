import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync, statSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const packages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react'].map((folder) => {
  const directory = resolve(root, 'packages', folder);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  return { directory, manifest };
});

test('ES module Vitest configurations declare their module format', () => {
  const failures = [];
  const packagesDirectory = resolve(root, 'packages');
  for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = resolve(packagesDirectory, entry.name);
    const manifestPath = resolve(directory, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const filename of readdirSync(directory)) {
      if (!/^vitest(?:\.[^.]+)?\.config\.[cm]?[jt]s$/.test(filename)) continue;
      const source = readFileSync(resolve(directory, filename), 'utf8');
      if (!/^\s*(?:import|export)\s/m.test(source)) continue;
      if (/\.(?:mts|mjs)$/.test(filename) || manifest.type === 'module') continue;
      failures.push(relative(root, resolve(directory, filename)));
    }
  }
  assert.deepEqual(
    failures,
    [],
    'ES module Vitest configurations require .mts, .mjs or package type module',
  );
});

function within(directory, filename) {
  const path = relative(directory, filename);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function output(pkg, entry) {
  assert.equal(typeof entry, 'string', `${pkg.manifest.name} must declare its output`);
  const path = realpathSync(resolve(pkg.directory, entry));
  assert.ok(within(resolve(pkg.directory, 'dist'), path), `${pkg.manifest.name} output must be in dist`);
  assert.ok(statSync(path).isFile(), `${pkg.manifest.name} output must be a file`);
  return path;
}

for (const mode of ['import', 'require']) {
  test(`public ${mode} exports execute the form instance API`, async () => {
    const modules = [];
    for (const pkg of packages) {
      const path = output(pkg, pkg.manifest.exports['.'][mode]);
      const resolved = mode === 'import'
        ? fileURLToPath(import.meta.resolve(pkg.manifest.name))
        : require.resolve(pkg.manifest.name);
      assert.equal(realpathSync(resolved), path);
      modules.push(mode === 'import' ? await import(pkg.manifest.name) : require(pkg.manifest.name));
    }
    const [validator, core, htmlGenerator, generator] = modules;
    // Each internal entry is built beside its main entry and shares its chunks.
    const entryNames = async (name) => {
      const entry = mode === 'import' ? await import(name) : require(name);
      return [entry, Object.keys(entry).filter(key => key !== 'default' && key !== '__esModule').sort()];
    };
    // The built internal entries export exactly what the contract manifest declares for them.
    const declared = JSON.parse(readFileSync(new URL('../../contracts/features.json', import.meta.url), 'utf8'));
    const internals = Object.fromEntries(declared.packages
      .filter(({ entries }) => entries['./internal'])
      .map(({ name, entries }) => [name, [...entries['./internal'].exports].sort()]));
    assert.deepEqual(Object.keys(internals).sort(), ['@crudui/generator-core', '@crudui/validator']);
    const loaded = {};
    for (const [name, expected] of Object.entries(internals)) {
      const pkg = packages.find(({ manifest }) => manifest.name === name);
      const internalName = `${name}/internal`;
      const internalPath = output(pkg, pkg.manifest.exports['./internal'][mode]);
      assert.equal(realpathSync(mode === 'import' ? fileURLToPath(import.meta.resolve(internalName)) : require.resolve(internalName)), internalPath);
      const [entry, names] = await entryNames(internalName);
      assert.deepEqual(names, expected, internalName);
      loaded[name] = entry;
    }
    assert.deepEqual((await entryNames('@crudui/validator'))[1], ['ComposeLoadError', 'FormInputError', 'validate', 'validateDetail', 'validateList']);
    // An error raised inside the internal entry is the class the public entry exports.
    assert.throws(() => new loaded['@crudui/validator'].MemoryLoader({}).load('missing.yml'), validator.ComposeLoadError);
    assert.equal(core.ComposeLoadError, validator.ComposeLoadError);
    assert.equal(core.FormInputError, validator.FormInputError);
    for (const name of ['compileForm', 'createForm', 'createRowKey', 'sequenceRowKey']) {
      assert.equal(typeof core[name], 'function', `core.${name}`);
      assert.equal(generator[name], undefined, `react.${name} belongs to generator-core`);
    }
    assert.equal(typeof validator.validate, 'function');
    assert.equal(typeof generator.Form, 'function');
    assert.equal(typeof htmlGenerator.renderForm, 'function');
    assert.equal(typeof htmlGenerator.renderList, 'function');
    const spec = { type: 'group', properties: { name: { type: 'text' } } };
    const template = core.compileForm(spec);
    const session = core.createForm(template, { name: 'Build check' });
    assert.ok(session instanceof core.FormInstance);
    assert.equal(session.template, template);
    assert.deepEqual(session.getData(), { name: 'Build check' });
    const result = validator.validate(spec, session.getData());
    assert.equal(typeof result.valid, 'boolean');
    assert.ok(Array.isArray(result.errors));
    const React = require('react');
    const { renderToString } = require('react-dom/server');
    const reactHtml = renderToString(React.createElement(generator.Form, { form: session }));
    assert.match(reactHtml, /<input\b/);
    assert.match(htmlGenerator.renderForm(session), /<input\b/);
  });
}

test('public type entries and their declaration graph compile in ESM and CommonJS', () => {
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  };
  const fixtures = ['public-types.mts', 'public-types.cts'].map((file) => resolve(root, 'tests/build', file));
  for (const pkg of packages) {
    const declared = output(pkg, pkg.manifest.types);
    assert.equal(output(pkg, pkg.manifest.exports['.'].types), declared);
    for (const fixture of fixtures) {
      const mode = fixture.endsWith('.mts') ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS;
      const resolution = ts.resolveModuleName(pkg.manifest.name, fixture, options, ts.sys, undefined, undefined, mode);
      assert.ok(resolution.resolvedModule, `${pkg.manifest.name} must resolve for ${fixture}`);
      assert.equal(realpathSync(resolution.resolvedModule.resolvedFileName), declared);
    }
  }
  const program = ts.createProgram(fixtures, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics.slice(0, 12), {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }));
  for (const source of program.getSourceFiles()) {
    const filename = realpathSync(source.fileName);
    for (const pkg of packages) {
      if (within(pkg.directory, filename)) {
        assert.ok(within(resolve(pkg.directory, 'dist'), filename), `declarations consumed package source: ${relative(root, filename)}`);
        assert.ok(source.isDeclarationFile, `non-declaration package input: ${relative(root, filename)}`);
      }
    }
  }
});

test('generator-core exposes the only form stylesheet through the public crudui.css export', () => {
  const pkg = packages.find(({ manifest }) => manifest.name === '@crudui/generator-core');
  const path = realpathSync(resolve(pkg.directory, pkg.manifest.exports['./crudui.css']));
  assert.equal(realpathSync(require.resolve(`${pkg.manifest.name}/crudui.css`)), path);
  assert.equal(realpathSync(fileURLToPath(import.meta.resolve(`${pkg.manifest.name}/crudui.css`))), path);
  assert.ok(readFileSync(path).length > 0, 'public stylesheet must not be empty');
  for (const other of packages.filter(({ manifest }) => manifest.name !== '@crudui/generator-core')) {
    assert.ok(!Object.keys(other.manifest.exports ?? {}).some(key => key.endsWith('.css')), `${other.manifest.name} must not export a stylesheet`);
  }
});


test('declaration builds emit no files when a public type is invalid', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'crudui-declaration-error-'));
  try {
    const source = resolve(temporary, 'invalid.ts');
    writeFileSync(source, "export const value: number = 'invalid';\n");
    for (const folder of ['validator-ts', 'generator-core', 'generator-react', 'generator-vue']) {
      const directory = resolve(root, 'packages', folder);
      const filename = resolve(directory, 'tsconfig.build.json');
      const config = ts.readConfigFile(filename, ts.sys.readFile);
      assert.equal(config.error, undefined);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
      assert.equal(parsed.options.noEmitOnError, true);
      assert.equal(parsed.options.emitDeclarationOnly, true);
      const output = resolve(temporary, folder);
      const program = ts.createProgram([source], { ...parsed.options, rootDir: temporary, outDir: output });
      assert.ok(ts.getPreEmitDiagnostics(program).some(error => error.code === 2322));
      assert.equal(program.emit().emitSkipped, true);
      assert.equal(existsSync(output), false);
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

const skippedDirectories = new Set(['node_modules', 'vendor', 'target', 'dist', '.git']);
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * The command programs a package directory publishes. A published package is a library: a
 * non-private package.json, a composer.json whose type is not project, a Go module or a Rust
 * crate. Usage examples under `examples/` are not installed and are not commands.
 */
function publishedCommands(directory) {
  const found = [];
  const json = name => existsSync(resolve(directory, name)) ? JSON.parse(readFileSync(resolve(directory, name), 'utf8')) : undefined;
  const npm = json('package.json');
  if (npm && npm.private !== true && Object.hasOwn(npm, 'bin')) found.push('package.json bin');
  const composer = json('composer.json');
  if (composer && composer.type !== 'project') {
    if (Object.hasOwn(composer, 'bin')) found.push('composer.json bin');
    for (const file of files(directory)) {
      if (file.endsWith('.php') && readFileSync(file, 'utf8').startsWith('#!')) found.push(`PHP command ${relative(directory, file)}`);
    }
  }
  if (existsSync(resolve(directory, 'go.mod'))) {
    for (const file of files(directory)) {
      const path = relative(directory, file);
      if (!file.endsWith('.go') || path.split(sep).includes('examples')) continue;
      const source = readFileSync(file, 'utf8');
      // A build-ignored file is never compiled into the module; go generate runs it as a script.
      if (/^package main$/m.test(source) && !/^\/\/go:build ignore$/m.test(source)) found.push(`Go package main ${path}`);
    }
  }
  const cargo = existsSync(resolve(directory, 'Cargo.toml')) ? readFileSync(resolve(directory, 'Cargo.toml'), 'utf8') : undefined;
  if (cargo !== undefined) {
    if (/^\s*\[\[bin\]\]/m.test(cargo)) found.push('Cargo.toml [[bin]]');
    if (existsSync(resolve(directory, 'src/bin'))) found.push('Rust src/bin');
    if (existsSync(resolve(directory, 'src/main.rs'))) found.push('Rust src/main.rs');
  }
  return found;
}

test('each command form in a published package is detected', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'crudui-package-commands-'));
  const make = (name, entries) => {
    const directory = resolve(temporary, name);
    for (const [path, content] of Object.entries(entries)) {
      mkdirSync(dirname(resolve(directory, path)), { recursive: true });
      writeFileSync(resolve(directory, path), content);
    }
    return publishedCommands(directory);
  };
  try {
    assert.deepEqual(make('npm', { 'package.json': '{"name":"a","bin":"cli.js"}' }), ['package.json bin']);
    assert.deepEqual(make('npm-private', { 'package.json': '{"name":"a","private":true,"bin":"cli.js"}' }), []);
    assert.deepEqual(make('composer', { 'composer.json': '{"type":"library","bin":["bin/run"]}' }), ['composer.json bin']);
    assert.deepEqual(make('composer-script', { 'composer.json': '{}', 'bin/run.php': '#!/usr/bin/env php\n<?php\n' }), [`PHP command ${join('bin', 'run.php')}`]);
    assert.deepEqual(make('composer-project', { 'composer.json': '{"type":"project","bin":["run"]}', 'run.php': '#!/usr/bin/env php\n' }), []);
    assert.deepEqual(make('go', { 'go.mod': 'module a\n', 'cmd/run/main.go': 'package main\n', 'lib.go': 'package a\n' }), [`Go package main ${join('cmd', 'run', 'main.go')}`]);
    assert.deepEqual(make('go-root', { 'go.mod': 'module a\n', 'main.go': '// Command.\npackage main\n' }), ['Go package main main.go']);
    assert.deepEqual(make('go-example', { 'go.mod': 'module a\n', 'examples/server/main.go': 'package main\n', 'gen.go': '//go:build ignore\n\npackage main\n' }), []);
    assert.deepEqual(make('rust-bin', { 'Cargo.toml': '[package]\nname = "a"\n\n[[bin]]\nname = "run"\n' }), ['Cargo.toml [[bin]]']);
    assert.deepEqual(make('rust-src-bin', { 'Cargo.toml': '[package]\n', 'src/bin/run.rs': 'fn main() {}\n' }), ['Rust src/bin']);
    assert.deepEqual(make('rust-main', { 'Cargo.toml': '[package]\n', 'src/main.rs': 'fn main() {}\n', 'examples/form.rs': 'fn main() {}\n' }), ['Rust src/main.rs']);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('no published package declares or contains a command', () => {
  const packagesDirectory = resolve(root, 'packages');
  const declared = readdirSync(packagesDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => publishedCommands(resolve(packagesDirectory, entry.name)).map(command => `${entry.name}: ${command}`));
  assert.deepEqual(declared, [], 'published packages are libraries; per-language programs live beside the tests that run them');
});
