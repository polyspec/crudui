import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync, statSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { tmpdir } from 'node:os';
import ts from 'typescript';

import { trackedFiles } from '../../scripts/tracked-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const load = (folder) => {
  const directory = resolve(root, 'packages', folder);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  return { directory, manifest };
};
const packages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react'].map(load);
// Packages that publish only an ES module: the browser validation binding runs only in a browser
// (docs/spec/form-runtime.md#browser-validation).
const moduleOnlyPackages = ['form-binding'].map(load);
// ES module packages whose declarations TypeScript resolves through the top-level types condition:
// generator-vue loads through its import and require exports, and generator-svelte through the
// svelte export of the Svelte toolchain.
const moduleDeclarationPackages = ['generator-vue', 'generator-svelte'].map(load);
const contract = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));

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

test('ES module packages load through their import export only', async () => {
  for (const pkg of moduleOnlyPackages) {
    const name = pkg.manifest.name;
    const path = realpathSync(fileURLToPath(import.meta.resolve(name)));
    assert.ok(within(resolve(pkg.directory, 'dist'), path) && statSync(path).isFile(), `${name} must load from a file in dist`);
    const declared = contract.packages.find((entry) => entry.name === name).entries['.'].exports;
    assert.deepEqual(Object.keys(await import(name)).sort(), [...declared].sort(), name);
    assert.throws(() => require.resolve(name), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }, `${name} must not declare a CommonJS entry`);
  }
});

/**
 * A compiler host that resolves modules as TypeScript does, and a relative `.svelte` import to the
 * `.svelte.d.ts` declaration that svelte-package writes beside it, as the Svelte toolchain does.
 */
function svelteCompilerHost(options) {
  const host = ts.createCompilerHost(options);
  const cache = ts.createModuleResolutionCache(root, (file) => file, options);
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, compilerOptions, containingSource) => literals.map((literal) => {
    const declaration = resolve(dirname(containingFile), `${literal.text}.d.ts`);
    if (/^\.\.?\//.test(literal.text) && literal.text.endsWith('.svelte') && ts.sys.fileExists(declaration)) {
      return { resolvedModule: { resolvedFileName: declaration, extension: ts.Extension.Dts, isExternalLibraryImport: true } };
    }
    const mode = ts.getModeForUsageLocation(containingSource, literal, compilerOptions);
    return ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, cache, redirected, mode);
  });
  return host;
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
  // An ES module package resolves only for the ES module fixture, to declarations in ES module format.
  const moduleFormats = new Map();
  for (const pkg of moduleOnlyPackages) {
    const [moduleFixture, commonFixture] = fixtures;
    const resolution = ts.resolveModuleName(pkg.manifest.name, moduleFixture, options, ts.sys, undefined, undefined, ts.ModuleKind.ESNext);
    assert.ok(resolution.resolvedModule, `${pkg.manifest.name} must resolve for ${moduleFixture}`);
    moduleFormats.set(realpathSync(resolution.resolvedModule.resolvedFileName), pkg.manifest.name);
    const common = ts.resolveModuleName(pkg.manifest.name, commonFixture, options, ts.sys, undefined, undefined, ts.ModuleKind.CommonJS);
    assert.equal(common.resolvedModule, undefined, `${pkg.manifest.name} must not resolve types for a CommonJS project`);
  }
  // An ES module package with a top-level types condition resolves for the ES module fixture, to
  // declarations in ES module format; the CommonJS fixture also requires generator-vue.
  for (const pkg of moduleDeclarationPackages) {
    const declared = output(pkg, pkg.manifest.types);
    assert.equal(output(pkg, pkg.manifest.exports['.'].types), declared);
    const resolution = ts.resolveModuleName(pkg.manifest.name, fixtures[0], options, ts.sys, undefined, undefined, ts.ModuleKind.ESNext);
    assert.ok(resolution.resolvedModule, `${pkg.manifest.name} must resolve for ${fixtures[0]}`);
    assert.equal(realpathSync(resolution.resolvedModule.resolvedFileName), declared);
    moduleFormats.set(declared, pkg.manifest.name);
  }
  const program = ts.createProgram(fixtures, options, svelteCompilerHost(options));
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics.slice(0, 12), {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }));
  for (const [filename, name] of moduleFormats) {
    const source = program.getSourceFiles().find((file) => realpathSync(file.fileName) === filename);
    assert.ok(source, `${name} declarations must be part of the program`);
    assert.equal(source.impliedNodeFormat, ts.ModuleKind.ESNext, `${name} declarations must be in ES module format`);
  }
  for (const source of program.getSourceFiles()) {
    const filename = realpathSync(source.fileName);
    for (const pkg of [...packages, ...moduleOnlyPackages, ...moduleDeclarationPackages]) {
      if (within(pkg.directory, filename)) {
        assert.ok(within(resolve(pkg.directory, 'dist'), filename), `declarations read package source: ${relative(root, filename)}`);
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


// The published packages whose declarations TypeScript builds from tsconfig.build.json.
const declarationPackages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'form-binding'];

test('the declaration build check covers every published package with a declaration build', () => {
  const built = contract.packages
    .filter(({ path }) => existsSync(resolve(root, path, 'tsconfig.build.json')))
    .map(({ path }) => relative(resolve(root, 'packages'), resolve(root, path)));
  assert.deepEqual([...declarationPackages].sort(), built.sort());
});

test('declaration builds emit no files when a public type is invalid', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'crudui-declaration-error-'));
  try {
    const source = resolve(temporary, 'invalid.ts');
    writeFileSync(source, "export const value: number = 'invalid';\n");
    for (const folder of declarationPackages) {
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

/** The files of a package directory that Git tracks or does not ignore, as absolute paths. */
function* files(directory) {
  for (const file of trackedFiles(directory)) yield resolve(directory, file);
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
  // The check reads the files of a Git checkout (scripts/tracked-files.mjs).
  execFileSync('git', ['init', '--quiet'], { cwd: temporary });
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
