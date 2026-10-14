#!/usr/bin/env node
/**
 * Validate the executable CRUDUI contract manifest against the repository.
 *
 * Besides the manifest shape and its file links, the check compares every package's declared
 * entries with the real package: each JavaScript entry of package.json `exports` is declared
 * with its exact, sorted value exports (read from the source entry file with the program and checker of the TypeScript 7
 * API, aliases resolved, types excluded) and a visibility. Functions named in an
 * implemented feature's signature are public exports of the owner's "." entry, the error classes it
 * names are JavaScript built-in errors or public "." exports of a CRUDUI package, only code
 * of CRUDUI packages under packages/ imports an `internal` entry, and no package imports another
 * package's files by a relative path: it imports that package's entries by name.
 *
 * TypeScript 7.0 publishes its program and checker only as `typescript/unstable/sync` (and the AST predicates as
 * `typescript/unstable/ast/is`); package.json pins TypeScript exactly, and the stable API of TypeScript 7.1 replaces that
 * path (checklist C14.10-1). The API has no module resolution hook: the virtual file system callbacks of the API hide
 * node_modules and give each `.svelte` component a two-line declaration of its default export, `<name>.d.svelte.ts`, which
 * `allowArbitraryExtensions` resolves the import to (programFileSystem).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Ajv } from 'ajv';
import { API, SymbolFlags, type Checker, type Symbol as TsSymbol } from 'typescript/unstable/sync';
import { SyntaxKind, type Node } from 'typescript/unstable/ast';
import * as is from 'typescript/unstable/ast/is';
import type { FileSystem } from 'typescript/unstable/fs';

import { checkedFiles } from '@polyspec/kit/tracked-files';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(resolve(scriptRoot, 'contracts/features.schema.json'), 'utf8')) as object;

/** An entry of a package of the manifest (contracts/features.schema.json). */
interface ManifestEntry {
  visibility: string;
  exports: string[];
}

/** A package of the manifest. */
interface ManifestPackage {
  name: string;
  path: string;
  entries: Record<string, ManifestEntry>;
}

/** A feature of the manifest. */
interface ManifestFeature {
  id: string;
  owner: string;
  status: string;
  signature: string;
  errors: string[];
  support: Record<string, string>;
  fixtures: string[];
  tests: string[];
  docs: string[];
  verification: { id: string, command: string }[];
}

/** contracts/features.json; the schema check reports a manifest of another shape. */
interface Manifest {
  format: string;
  version: string;
  supportValues: string[];
  packages: ManifestPackage[];
  features: ManifestFeature[];
  fixtures: { path: string }[];
  examples: { id: string, input: string, expected: string }[];
}

/** A value of a package.json exports map: a target path, a list of targets, or conditions and subpaths. */
type ExportsValue = string | null | ExportsValue[] | { [key: string]: ExportsValue };

/** The part of a package.json that the check reads. */
interface PackageManifest {
  name?: string;
  exports?: string | ExportsValue[] | { [key: string]: ExportsValue };
}

/** The value exports of a source entry file and those whose alias chain cannot be resolved. */
interface ValueExports {
  values: string[];
  unresolved: string[];
}

export interface ManifestCheck {
  errors: string[];
  counts: { features: number, packages: number, entries: number, fixtures: number };
}
const schemaValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const codeTarget = /\.[cm]?js$/;
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const scannedExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.vue', '.md', '.html']);
// A `.svelte` module's only value export is its component.
const svelteModuleText = 'declare const component: unknown;\nexport default component;\n';
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// A feature error that names a class is one of these or a public "." export of a CRUDUI package.
const builtInErrors = new Set(['AggregateError', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError']);
const errorClassName = /^[A-Z][A-Za-z0-9]*Error$/;

/** The package.json exports map with its subpaths as keys. */
function exportsMap(packageManifest: PackageManifest): Record<string, ExportsValue> {
  const map = packageManifest.exports;
  if (map === undefined) return {};
  if (typeof map === 'string' || Array.isArray(map) || !Object.keys(map).every((key) => key.startsWith('.'))) return { '.': map };
  return map;
}

/** JavaScript files an exports target resolves to under any condition. */
function codeTargets(target: ExportsValue): string[] {
  if (typeof target === 'string') return codeTarget.test(target) ? [target] : [];
  if (Array.isArray(target)) return target.flatMap(codeTargets);
  if (target && typeof target === 'object') return Object.values(target).flatMap(codeTargets);
  return [];
}

/** The source file a build output comes from: `./dist/<name>.<js>` is built from `src/<name>.<ts|js>`. */
function sourceFor(packagePath: string, target: string): string | undefined {
  const match = /^\.\/dist\/(.+)\.[cm]?js$/.exec(target);
  if (!match) return undefined;
  return sourceExtensions.map((extension) => resolve(packagePath, 'src', match[1] + extension)).find((file) => existsSync(file));
}

// An import clause is type-only when its phase modifier is `type`; an export specifier's export declaration and an
// import specifier's import clause are its grandparent, a namespace import's import clause and a namespace export's
// export declaration its parent.
const typeOnlyClause = (node: Node): boolean => is.isImportClause(node) && node.phaseModifier === SyntaxKind.TypeKeyword;
const typeOnlyExport = (node: Node): boolean => is.isExportDeclaration(node) && node.isTypeOnly;

function isTypeOnly(declaration: Node): boolean {
  if (is.isExportSpecifier(declaration)) return declaration.isTypeOnly || typeOnlyExport(declaration.parent.parent);
  if (is.isImportSpecifier(declaration)) return declaration.isTypeOnly || typeOnlyClause(declaration.parent.parent);
  if (is.isImportClause(declaration)) return typeOnlyClause(declaration);
  if (is.isImportEqualsDeclaration(declaration)) return declaration.isTypeOnly;
  if (is.isNamespaceImport(declaration)) return typeOnlyClause(declaration.parent);
  if (is.isNamespaceExport(declaration)) return typeOnlyExport(declaration.parent);
  return false;
}

/** 'value', 'type' or 'unresolved' for one exported symbol, following its alias chain. */
function exportKind(checker: Checker, symbol: TsSymbol): 'value' | 'type' | 'unresolved' {
  let current = symbol;
  const seen = new Set<number>();
  while (current.flags & SymbolFlags.Alias) {
    if (current.declarations.some((handle) => {
      const declaration = handle.resolve();
      assert.ok(declaration, 'a declaration of an export resolves in its program');
      return isTypeOnly(declaration);
    })) return 'type';
    if (seen.has(current.id)) return 'unresolved';
    seen.add(current.id);
    const next = checker.getImmediateAliasedSymbol(current);
    if (!next || next.declarations.length === 0) return 'unresolved';
    current = next;
  }
  return current.flags & SymbolFlags.Value ? 'value' : 'type';
}

/**
 * The file system of the program, in the virtual file system callbacks of the API: the configuration of the program is
 * `configFile`, nothing under node_modules exists, since only repository modules matter, and a `.svelte` component whose
 * file exists has the declaration `<name>.d.svelte.ts` that `allowArbitraryExtensions` resolves its import to, with the
 * component as its only value export.
 */
function programFileSystem(configFile: string, configText: string): FileSystem {
  const svelteDeclaration = (file: string): boolean => {
    const match = /^(.*)\.d\.svelte\.ts$/.exec(file);
    return match !== null && existsSync(`${match[1]}.svelte`);
  };
  const installed = (path: string): boolean => /\/node_modules(?:\/|$)/.test(path);
  return {
    readFile: (file) => (file === configFile ? configText : svelteDeclaration(file) ? svelteModuleText : installed(file) ? null : undefined),
    fileExists: (file) => (file === configFile || svelteDeclaration(file) ? true : installed(file) ? false : undefined),
    directoryExists: (directory) => (installed(directory) ? false : undefined),
  };
}

/** Value exports of source entry files; `aliases` maps package specifiers to source files. */
function readValueExports(
  files: string[], aliases: Record<string, string | undefined>,
): Map<string, ValueExports> {
  const configFile = resolve(scriptRoot, 'tsconfig.contract-manifest.json');
  // A package specifier resolves to its source entry; one without a source entry resolves to nothing, as no node_modules exists.
  const paths = Object.fromEntries(Object.entries(aliases).filter(([, file]) => file).map(([specifier, file]) => [specifier, [file]]));
  const configText = JSON.stringify({
    compilerOptions: {
      allowJs: true, noEmit: true, noLib: true, types: [], jsx: 'react-jsx', target: 'es2022', module: 'esnext',
      moduleResolution: 'bundler', allowImportingTsExtensions: true, allowArbitraryExtensions: true, paths,
    },
    files,
  });
  const api = new API({ cwd: scriptRoot, fs: programFileSystem(configFile, configText) });
  try {
    const project = api.updateSnapshot({ openProjects: [configFile] }).getProject(configFile);
    assert.ok(project, `the API opens the project of ${configFile}`);
    const { checker, program } = project;
    const result = new Map<string, ValueExports>();
    for (const file of files) {
      const source = program.getSourceFile(file);
      const moduleSymbol = source && checker.getSymbolAtLocation(source);
      const values: string[] = [];
      const unresolved: string[] = [];
      for (const symbol of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
        const kind = exportKind(checker, symbol);
        if (kind === 'type') continue;
        values.push(symbol.name);
        if (kind === 'unresolved') unresolved.push(symbol.name);
      }
      result.set(file, { values: values.sort(byCodeUnit), unresolved: unresolved.sort(byCodeUnit) });
    }
    return result;
  } finally {
    api.close();
  }
}

/** Functions a signature names: each call outside a member access, with the `a | b(` names before it. */
function signatureFunctions(signature: string): string[] {
  const names = new Set<string>();
  for (const clause of signature.split(';')) {
    const [call] = clause.split('->');
    assert.ok(call !== undefined);
    for (const match of call.matchAll(/(?<![\w$.])((?:[A-Za-z_$][\w$]*\s*\|\s*)*)([A-Za-z_$][\w$]*)\s*\(/g)) {
      const [, alternatives, last] = match;
      assert.ok(alternatives !== undefined && last !== undefined);
      for (const name of [...alternatives.split('|'), last].map((part) => part.trim()).filter(Boolean)) names.add(name);
    }
  }
  return [...names].filter((name) => name !== 'new').sort(byCodeUnit);
}

/**
 * Repository files that can hold module specifiers, relative to the root with `/` separators: the files of the
 * checkout that Git tracks or does not ignore, so installed and generated output never takes part.
 */
function scannedFiles(root: string): string[] {
  return checkedFiles(root).filter(file => scannedExtensions.has(extname(file)));
}

// A relative specifier in an import, export, require, dynamic import or Vitest module mock.
const relativeSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|unmock|doUnmock)\s*\(\s*)(['"`])(\.\.?\/[^'"`\s]*)\1/g;
const moduleSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])(@polyspec\/crudui-[^'"`\s]+)\1/g;

/** Check the manifest of the repository at `root`; returns the failures and the checked counts. */
export function checkContractManifest(root: string): ManifestCheck {
  const manifest = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8')) as Manifest;
  const errors: string[] = [];
  const check = (condition: unknown, message: string): void => { if (!condition) errors.push(message); };

  check(schemaValidate(manifest), `manifest schema: ${(schemaValidate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('; ')}`);
  check(manifest.format === 'crudui/features-manifest', 'format must identify the CRUDUI feature manifest');
  check(manifest.version === '0.0.5', 'manifest version must match the package version');
  const supportValues = new Set(manifest.supportValues);

  // Entries: package.json code entries and manifest entries match one to one.
  const packageNames = new Set<string>();
  const declaredEntries: { pkg: ManifestPackage, subpath: string, entry: ManifestEntry, source: string }[] = [];
  for (const pkg of manifest.packages ?? []) {
    check(!packageNames.has(pkg.name), `duplicate package: ${pkg.name}`);
    packageNames.add(pkg.name);
    const packagePath = resolve(root, pkg.path);
    const packageFile = resolve(packagePath, 'package.json');
    check(existsSync(packageFile), `${pkg.name}: missing ${pkg.path}/package.json`);
    if (!existsSync(packageFile)) continue;
    const packageManifest = JSON.parse(readFileSync(packageFile, 'utf8')) as PackageManifest;
    check(packageManifest.name === pkg.name, `${pkg.path}: package name mismatch`);
    const entries = pkg.entries ?? {};
    const codeEntries = Object.entries(exportsMap(packageManifest)).filter(([, target]) => codeTargets(target).length > 0);
    for (const [subpath, target] of codeEntries) {
      if (!(subpath in entries)) {
        errors.push(`${pkg.name}: package.json code entry "${subpath}" is not declared in the manifest`);
        continue;
      }
      const sources = new Set<string>();
      const unmatched = new Set<string>();
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
      const entry = entries[subpath];
      const [source] = sources;
      assert.ok(entry);
      if (sources.size === 1 && source !== undefined) declaredEntries.push({ pkg, subpath, entry, source });
    }
    for (const subpath of Object.keys(entries)) {
      check(codeEntries.some(([name]) => name === subpath), `${pkg.name}: manifest entry "${subpath}" is not a package.json code entry`);
    }
  }

  // Exports: the declared list is the sorted list of the entry's value exports.
  const aliases: Record<string, string | undefined> = {};
  for (const pkg of manifest.packages ?? []) {
    for (const subpath of Object.keys(pkg.entries ?? {})) aliases[subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)] = undefined;
  }
  for (const { pkg, subpath, source } of declaredEntries) aliases[subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)] = source;
  const actual = readValueExports(declaredEntries.map(({ source }) => source), aliases);
  for (const { pkg, subpath, entry, source } of declaredEntries) {
    const label = `${pkg.name} "${subpath}"`;
    const exports = actual.get(source);
    assert.ok(exports);
    const { values, unresolved } = exports;
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
  const featureIds = new Set<string>();
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
    const verificationIds = new Set<string>();
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
  const internal = new Set<string>();
  for (const pkg of manifest.packages ?? []) {
    for (const [subpath, entry] of Object.entries(pkg.entries ?? {})) {
      if (entry.visibility === 'internal') internal.add(subpath === '.' ? pkg.name : pkg.name + subpath.slice(1));
    }
  }
  const packageCode = (file: string): boolean => file.startsWith('packages/') && !file.endsWith('.md');
  for (const file of scannedFiles(root).sort(byCodeUnit)) {
    if (packageCode(file)) continue;
    const text = readFileSync(resolve(root, file), 'utf8');
    if (!text.includes('@polyspec/crudui-')) continue;
    const imported = new Set([...text.matchAll(moduleSpecifier)].map((match) => match[2])
      .filter((specifier): specifier is string => specifier !== undefined && internal.has(specifier)));
    for (const specifier of [...imported].sort(byCodeUnit)) errors.push(`${file} imports the internal entry ${specifier}`);
  }

  // Packages import each other by entry name: a relative path from one package directory into
  // another one bypasses the entry and its declared exports.
  const packageDirectory = (file: string): string | undefined => {
    const name = /^packages\/([^/]+)\//.exec(file)?.[1];
    return name !== undefined && existsSync(resolve(root, 'packages', name, 'package.json')) ? name : undefined;
  };
  for (const file of scannedFiles(root).sort(byCodeUnit)) {
    const own = packageDirectory(file);
    if (!own || ['.md', '.html'].includes(extname(file))) continue;
    const text = readFileSync(resolve(root, file), 'utf8');
    const specifiers = new Set<string>();
    for (const [, , specifier] of text.matchAll(relativeSpecifier)) {
      assert.ok(specifier !== undefined);
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
