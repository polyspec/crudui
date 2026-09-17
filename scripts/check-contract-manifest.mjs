#!/usr/bin/env node
/**
 * Validate the executable CRUDUI contract manifest against the repository.
 *
 * Besides the manifest shape and its file links, the check compares every package's declared
 * entries with the real package: each JavaScript entry of package.json `exports` is declared
 * with its exact, sorted value exports (read from the source entry file with the TypeScript
 * compiler, aliases resolved, types excluded) and a visibility. Functions named in an
 * implemented feature's signature are public exports of the owner's "." entry, the error classes it
 * names are JavaScript built-in errors or public "." exports of a CRUDUI package, only code
 * of CRUDUI packages under packages/ imports an `internal` entry, and no package imports another
 * package's files by a relative path: it imports that package's entries by name.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import ts from 'typescript';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(resolve(scriptRoot, 'contracts/features.schema.json'), 'utf8'));
const schemaValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const codeTarget = /\.[cm]?js$/;
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const scannedExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.vue', '.md', '.html']);
const ignoredDirectories = new Set(['.git', '.svelte-kit', 'dist', 'node_modules', 'out', 'target', 'vendor']);
// A `.svelte` module's only value export is its component.
const svelteModule = resolve(scriptRoot, '__svelte_component__.ts');
const svelteModuleText = 'declare const component: unknown;\nexport default component;\n';
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A feature error that names a class is one of these or a public "." export of a CRUDUI package.
const builtInErrors = new Set(['AggregateError', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError']);
const errorClassName = /^[A-Z][A-Za-z0-9]*Error$/;

/** The package.json exports map with its subpaths as keys. */
function exportsMap(packageManifest) {
  const map = packageManifest.exports;
  if (map === undefined) return {};
  if (typeof map === 'string' || Array.isArray(map) || !Object.keys(map).every((key) => key.startsWith('.'))) return { '.': map };
  return map;
}

/** JavaScript files an exports target resolves to under any condition. */
function codeTargets(target) {
  if (typeof target === 'string') return codeTarget.test(target) ? [target] : [];
  if (Array.isArray(target)) return target.flatMap(codeTargets);
  if (target && typeof target === 'object') return Object.values(target).flatMap(codeTargets);
  return [];
}

/** The source file a build output comes from: `./dist/<name>.<js>` is built from `src/<name>.<ts|js>`. */
function sourceFor(packagePath, target) {
  const match = /^\.\/dist\/(.+)\.[cm]?js$/.exec(target);
  if (!match) return undefined;
  return sourceExtensions.map((extension) => resolve(packagePath, 'src', match[1] + extension)).find((file) => existsSync(file));
}

function isTypeOnly(declaration) {
  if (ts.isExportSpecifier(declaration) || ts.isImportSpecifier(declaration)) return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly;
  if (ts.isImportClause(declaration) || ts.isImportEqualsDeclaration(declaration)) return declaration.isTypeOnly;
  if (ts.isNamespaceImport(declaration)) return declaration.parent.isTypeOnly;
  if (ts.isNamespaceExport(declaration)) return declaration.parent.isTypeOnly;
  return false;
}

/** 'value', 'type' or 'unresolved' for one exported symbol, following its alias chain. */
function exportKind(checker, symbol) {
  let current = symbol;
  const seen = new Set();
  while (current.flags & ts.SymbolFlags.Alias) {
    if ((current.declarations ?? []).some(isTypeOnly)) return 'type';
    if (seen.has(current)) return 'unresolved';
    seen.add(current);
    const next = checker.getImmediateAliasedSymbol(current);
    if (!next || !next.declarations?.length) return 'unresolved';
    current = next;
  }
  return current.flags & ts.SymbolFlags.Value ? 'value' : 'type';
}

/** Value exports of source entry files; `aliases` maps package specifiers to source files. */
function readValueExports(files, aliases) {
  const options = {
    allowJs: true, noEmit: true, noLib: true, types: [], jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, language, ...rest) => (fileName === svelteModule
    ? ts.createSourceFile(fileName, svelteModuleText, language)
    : getSourceFile(fileName, language, ...rest));
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => fileName === svelteModule || fileExists(fileName);
  // Only repository modules matter: relative imports, `.svelte` components and CRUDUI packages.
  host.resolveModuleNameLiterals = (literals, containingFile) => literals.map(({ text }) => {
    if (text.endsWith('.svelte')) return { resolvedModule: { resolvedFileName: svelteModule, extension: ts.Extension.Ts } };
    if (text in aliases) return aliases[text] ? { resolvedModule: { resolvedFileName: aliases[text], extension: extname(aliases[text]) } } : { resolvedModule: undefined };
    if (!text.startsWith('.')) return { resolvedModule: undefined };
    return ts.resolveModuleName(text, containingFile, options, host);
  });
  const program = ts.createProgram({ rootNames: files, options, host });
  const checker = program.getTypeChecker();
  const result = new Map();
  for (const file of files) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    const values = [];
    const unresolved = [];
    for (const symbol of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      const kind = exportKind(checker, symbol);
      if (kind === 'type') continue;
      values.push(symbol.escapedName.toString());
      if (kind === 'unresolved') unresolved.push(symbol.escapedName.toString());
    }
    result.set(file, { values: values.sort(byCodeUnit), unresolved: unresolved.sort(byCodeUnit) });
  }
  return result;
}

/** Functions a signature names: each call outside a member access, with the `a | b(` names before it. */
function signatureFunctions(signature) {
  const names = new Set();
  for (const clause of signature.split(';')) {
    const call = clause.split('->')[0];
    for (const match of call.matchAll(/(?<![\w$.])((?:[A-Za-z_$][\w$]*\s*\|\s*)*)([A-Za-z_$][\w$]*)\s*\(/g)) {
      for (const name of [...match[1].split('|'), match[2]].map((part) => part.trim()).filter(Boolean)) names.add(name);
    }
  }
  return [...names].filter((name) => name !== 'new').sort(byCodeUnit);
}

/** Repository files that can hold module specifiers, relative to the root with `/` separators. */
function scannedFiles(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...scannedFiles(root, path));
    } else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files;
}

// A relative specifier in an import, export, require, dynamic import or Vitest module mock.
const relativeSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|unmock|doUnmock)\s*\(\s*)(['"`])(\.\.?\/[^'"`\s]*)\1/g;
const moduleSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])(@crudui\/[^'"`\s]+)\1/g;

/** Check the manifest of the repository at `root`; returns the failures and the checked counts. */
export function checkContractManifest(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };

  check(schemaValidate(manifest), `manifest schema: ${(schemaValidate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('; ')}`);
  check(manifest.format === 'crudui/features-manifest', 'format must identify the CRUDUI feature manifest');
  check(manifest.version === '0.0.1', 'manifest version must match the package version');
  const supportValues = new Set(manifest.supportValues);

  // Entries: package.json code entries and manifest entries match one to one.
  const packageNames = new Set();
  const declaredEntries = [];
  for (const pkg of manifest.packages ?? []) {
    check(!packageNames.has(pkg.name), `duplicate package: ${pkg.name}`);
    packageNames.add(pkg.name);
    const packagePath = resolve(root, pkg.path);
    const packageFile = resolve(packagePath, 'package.json');
    check(existsSync(packageFile), `${pkg.name}: missing ${pkg.path}/package.json`);
    if (!existsSync(packageFile)) continue;
    const packageManifest = JSON.parse(readFileSync(packageFile, 'utf8'));
    check(packageManifest.name === pkg.name, `${pkg.path}: package name mismatch`);
    const entries = pkg.entries ?? {};
    const codeEntries = Object.entries(exportsMap(packageManifest)).filter(([, target]) => codeTargets(target).length > 0);
    for (const [subpath, target] of codeEntries) {
      if (!(subpath in entries)) {
        errors.push(`${pkg.name}: package.json code entry "${subpath}" is not declared in the manifest`);
        continue;
      }
      const sources = new Set();
      const unmatched = new Set();
      for (const output of codeTargets(target)) {
        const source = sourceFor(packagePath, output);
        const stem = output.replace(/\.[cm]?js$/, '');
        if (source) sources.add(source);
        else if (!unmatched.has(stem)) {
          unmatched.add(stem);
          errors.push(`${pkg.name}: package.json entry "${subpath}" has no source file for ${output}`);
        }
      }
      check(sources.size <= 1, `${pkg.name}: package.json entry "${subpath}" is built from more than one source file`);
      if (sources.size === 1) declaredEntries.push({ pkg, subpath, entry: entries[subpath], source: [...sources][0] });
    }
    for (const subpath of Object.keys(entries)) {
      check(codeEntries.some(([name]) => name === subpath), `${pkg.name}: manifest entry "${subpath}" is not a package.json code entry`);
    }
  }

  // Exports: the declared list is the sorted list of the entry's value exports.
  const aliases = {};
  for (const pkg of manifest.packages ?? []) {
    for (const subpath of Object.keys(pkg.entries ?? {})) aliases[subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)] = undefined;
  }
  for (const { pkg, subpath, source } of declaredEntries) aliases[subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)] = source;
  const actual = readValueExports(declaredEntries.map(({ source }) => source), aliases);
  for (const { pkg, subpath, entry, source } of declaredEntries) {
    const label = `${pkg.name} "${subpath}"`;
    const { values, unresolved } = actual.get(source);
    const declared = entry.exports ?? [];
    for (const name of unresolved) errors.push(`${label}: export cannot be resolved: ${name}`);
    const undeclared = values.filter((name) => !declared.includes(name));
    const missing = declared.filter((name) => !values.includes(name)).sort(byCodeUnit);
    if (undeclared.length) errors.push(`${label}: exported but not declared: ${undeclared.join(', ')}`);
    if (missing.length) errors.push(`${label}: declared but not exported: ${missing.join(', ')}`);
    const sorted = [...declared].sort(byCodeUnit);
    check(declared.every((name, index) => name === sorted[index]), `${label}: exports must be sorted: ${sorted.join(', ')}`);
  }

  // Features.
  const publicErrors = new Set(builtInErrors);
  for (const pkg of manifest.packages ?? []) {
    const main = pkg.entries?.['.'];
    if (main?.visibility === 'public') for (const name of main.exports ?? []) publicErrors.add(name);
  }
  const featureIds = new Set();
  for (const feature of manifest.features ?? []) {
    check(!featureIds.has(feature.id), `duplicate feature: ${feature.id}`);
    featureIds.add(feature.id);
    check(packageNames.has(feature.owner), `${feature.id}: owner is not listed: ${feature.owner}`);
    check(['planned', 'partial', 'implemented'].includes(feature.status), `${feature.id}: invalid status: ${feature.status}`);
    check(typeof feature.signature === 'string' && feature.signature.length > 0, `${feature.id}: signature is required`);
    check(Array.isArray(feature.errors) && feature.errors.length > 0, `${feature.id}: errors are required`);
    if (feature.status === 'implemented' && typeof feature.signature === 'string') {
      const main = manifest.packages.find((pkg) => pkg.name === feature.owner)?.entries?.['.'];
      const publicExports = main?.visibility === 'public' ? main.exports : [];
      for (const name of signatureFunctions(feature.signature)) {
        check(publicExports.includes(name), `${feature.id}: signature function ${name} is not a public "." export of ${feature.owner}`);
      }
      for (const name of (feature.errors ?? []).filter((error) => errorClassName.test(error))) {
        check(publicErrors.has(name), `${feature.id}: error ${name} is neither a JavaScript built-in error nor a public "." export of a CRUDUI package`);
      }
    }
    for (const support of Object.values(feature.support ?? {})) check(supportValues.has(support), `${feature.id}: invalid support value: ${support}`);
    for (const fixture of feature.fixtures ?? []) check(existsSync(resolve(root, fixture)), `${feature.id}: missing fixture: ${fixture}`);
    for (const test of feature.tests ?? []) check(existsSync(resolve(root, test)), `${feature.id}: missing test: ${test}`);
    const verificationIds = new Set();
    check(feature.status === 'planned' || feature.verification.length > 0, `${feature.id}: verification commands are required for non-planned features`);
    for (const verification of feature.verification ?? []) {
      check(!verificationIds.has(verification.id), `${feature.id}: duplicate verification: ${verification.id}`);
      verificationIds.add(verification.id);
      check(typeof verification.command === 'string' && verification.command.length > 0, `${feature.id}: verification command is required: ${verification.id}`);
    }
    for (const doc of feature.docs ?? []) check(existsSync(resolve(root, doc)), `${feature.id}: missing document: ${doc}`);
  }

  for (const fixture of manifest.fixtures ?? []) check(existsSync(resolve(root, fixture.path)), `missing fixture: ${fixture.path}`);
  for (const example of manifest.examples ?? []) {
    check(existsSync(resolve(root, example.input)), `${example.id}: missing input: ${example.input}`);
    check(existsSync(resolve(root, example.expected)), `${example.id}: missing expected output: ${example.expected}`);
  }

  // Internal entries: only code of CRUDUI packages imports them; examples, tests and documents use public entries.
  const internal = new Set();
  for (const pkg of manifest.packages ?? []) {
    for (const [subpath, entry] of Object.entries(pkg.entries ?? {})) {
      if (entry.visibility === 'internal') internal.add(subpath === '.' ? pkg.name : pkg.name + subpath.slice(1));
    }
  }
  const packageCode = (file) => file.startsWith('packages/') && !file.endsWith('.md');
  for (const file of scannedFiles(root).sort(byCodeUnit)) {
    if (packageCode(file)) continue;
    const text = readFileSync(resolve(root, file), 'utf8');
    if (!text.includes('@crudui/')) continue;
    const imported = new Set([...text.matchAll(moduleSpecifier)].map((match) => match[2]).filter((specifier) => internal.has(specifier)));
    for (const specifier of [...imported].sort(byCodeUnit)) errors.push(`${file} imports the internal entry ${specifier}`);
  }

  // Packages import each other by entry name: a relative path from one package directory into
  // another one bypasses the entry and its declared exports.
  const packageDirectory = (file) => {
    const match = /^packages\/([^/]+)\//.exec(file);
    return match && existsSync(resolve(root, 'packages', match[1], 'package.json')) ? match[1] : undefined;
  };
  for (const file of scannedFiles(root).sort(byCodeUnit)) {
    const own = packageDirectory(file);
    if (!own || ['.md', '.html'].includes(extname(file))) continue;
    const text = readFileSync(resolve(root, file), 'utf8');
    const specifiers = new Set();
    for (const [, , specifier] of text.matchAll(relativeSpecifier)) {
      const target = relative(root, resolve(root, dirname(file), specifier)).split(sep).join('/');
      const other = /^packages\/([^/]+)(?:\/|$)/.exec(target)?.[1];
      if (other !== undefined && other !== own) specifiers.add(specifier);
    }
    for (const specifier of [...specifiers].sort(byCodeUnit)) errors.push(`${file} imports another package's source: ${specifier}`);
  }

  return {
    errors,
    counts: { features: manifest.features?.length ?? 0, packages: manifest.packages?.length ?? 0, entries: declaredEntries.length, fixtures: manifest.fixtures?.length ?? 0 },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { errors, counts } = checkContractManifest(scriptRoot);
  if (errors.length) {
    process.stderr.write(`[manifest] ${errors.length} failure(s)\n${errors.map((error) => `  ${error}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`[manifest] ${counts.features} features, ${counts.packages} packages with ${counts.entries} entries and ${counts.fixtures} fixture links passed\n`);
  }
}
