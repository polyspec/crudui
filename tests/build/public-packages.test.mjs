import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync, statSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
    for (const name of ['compileForm', 'createForm', 'createRowKey', 'sequenceRowKey']) {
      assert.equal(typeof core[name], 'function', `core.${name}`);
      assert.equal(typeof generator[name], 'function', `react.${name}`);
    }
    assert.equal(typeof validator.validate, 'function');
    assert.equal(typeof generator.Form, 'function');
    assert.equal(typeof htmlGenerator.renderForm, 'function');
    assert.equal(typeof htmlGenerator.renderList, 'function');
    const spec = { type: 'group', properties: { name: { type: 'text' } } };
    const template = core.compileForm(spec);
    const session = generator.createForm(template, { name: 'Build check' });
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

test('React exposes its complete stylesheet through the public styles.css export', () => {
  const pkg = packages.find(({ manifest }) => manifest.name === '@crudui/generator-react');
  const path = output(pkg, pkg.manifest.exports['./styles.css']);
  assert.equal(realpathSync(require.resolve(`${pkg.manifest.name}/styles.css`)), path);
  assert.equal(realpathSync(fileURLToPath(import.meta.resolve(`${pkg.manifest.name}/styles.css`))), path);
  const css = readFileSync(path);
  assert.ok(css.length > 0, 'public stylesheet must not be empty');
  assert.deepEqual(css, readFileSync(resolve(pkg.directory, 'src/styles/crudui.css')));
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
