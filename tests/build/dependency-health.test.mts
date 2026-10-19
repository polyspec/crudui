import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { orderedJsonCheckout, orderedJsonRepository, orderedJsonTag, orderedJsonVersion } from '../../examples/form-comparison/src/ordered-json-source.mjs';
import { makeTargets, nodeTestArguments } from '../../scripts/test-commands.mts';
import { checked, readJson, type JTDSchemaType } from '../json.mts';

const root = path.resolve(import.meta.dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const git = process.platform === 'win32' ? 'git.exe' : 'git';

/** The fields of a package.json that the checks read. */
interface PackageManifest {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  allowScripts?: Record<string, unknown>;
}
/** The fields of a package-lock.json that the checks read. */
interface PackageLock { packages?: Record<string, { link?: boolean; resolved?: string; integrity?: string }> }
/** The JSON report of `npm ls --json`. */
interface NpmReport { problems?: string[]; error?: { summary?: string } }
/** The fields of a composer.json that the checks read; a repository that disables packagist.org has no type. */
interface ComposerManifest {
  name?: string;
  type?: string;
  version?: string;
  repositories?: { type?: string; url?: string; options?: { symlink?: boolean } }[];
  require?: Record<string, string>;
}
/** The fields of a composer.lock that the checks read. */
interface ComposerLockPackage { name: string; dist?: { type: string }; 'transport-options'?: { symlink?: boolean } }
interface ComposerLock { packages?: ComposerLockPackage[]; 'packages-dev'?: ComposerLockPackage[] }

const dependencies: JTDSchemaType<Record<string, string>> = { values: { type: 'string' } };
const packageSchema: JTDSchemaType<PackageManifest> = {
  optionalProperties: {
    name: { type: 'string' }, workspaces: { elements: { type: 'string' } }, dependencies, devDependencies: dependencies,
    optionalDependencies: dependencies, peerDependencies: dependencies, allowScripts: { values: {} },
  },
  additionalProperties: true,
};
const lockSchema: JTDSchemaType<PackageLock> = {
  optionalProperties: {
    packages: {
      values: { optionalProperties: { link: { type: 'boolean' }, resolved: { type: 'string' }, integrity: { type: 'string' } }, additionalProperties: true },
    },
  },
  additionalProperties: true,
};
const reportSchema: JTDSchemaType<NpmReport> = {
  optionalProperties: { problems: { elements: { type: 'string' } }, error: { optionalProperties: { summary: { type: 'string' } }, additionalProperties: true } },
  additionalProperties: true,
};
const composerSchema: JTDSchemaType<ComposerManifest> = {
  optionalProperties: {
    name: { type: 'string' },
    type: { type: 'string' },
    version: { type: 'string' },
    repositories: {
      elements: {
        optionalProperties: {
          type: { type: 'string' }, url: { type: 'string' },
          options: { optionalProperties: { symlink: { type: 'boolean' } }, additionalProperties: true },
        },
        additionalProperties: true,
      },
    },
    require: dependencies,
  },
  additionalProperties: true,
};
const composerPackage: JTDSchemaType<ComposerLockPackage> = {
  properties: { name: { type: 'string' } },
  optionalProperties: {
    dist: { properties: { type: { type: 'string' } }, additionalProperties: true },
    'transport-options': { optionalProperties: { symlink: { type: 'boolean' } }, additionalProperties: true },
  },
  additionalProperties: true,
};
const composerLockSchema: JTDSchemaType<ComposerLock> = {
  optionalProperties: { packages: { elements: composerPackage }, 'packages-dev': { elements: composerPackage } },
  additionalProperties: true,
};
/** The package.json in `directory` of the checkout. */
const packageManifest = (directory: string): PackageManifest => readJson(path.join(root, directory, 'package.json'), packageSchema);
/** A Makefile target as makeTargets of scripts/test-commands.mts returns it. */
interface MakeRule { prerequisites: string[]; commands: string[] }

/** The capture group `index` of a regular expression match, which the pattern always captures. */
function captured(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  assert.ok(value !== undefined, `${match[0]} has no group ${index}`);
  return value;
}

function execute(command: string, args: string[], cwd: string = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error !== undefined) assert.fail(result.error.message);
  return result;
}

function executeNpm(args: string[], cwd: string = root) {
  const result = execute(npm, args, cwd);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    assert.fail([
      `npm ${args.join(' ')} did not return JSON:`,
      result.stdout,
      result.stderr,
    ].join('\n'));
  }
  return { ...result, report: checked(parsed, reportSchema, `npm ${args.join(' ')}`) };
}

function trackedLockFiles(): string[] {
  const result = execute(git, ['ls-files', '--', 'package-lock.json', '**/package-lock.json']);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function trackedComposerFiles(basename: string): string[] {
  const result = execute(git, ['ls-files', '--', basename, `**/${basename}`]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function workspacePackageDirectories(): string[] {
  const manifest = packageManifest('.');
  // The workspaces of package.json are the folders of the packages, one by one (C14.7).
  return (manifest.workspaces ?? []).map((workspace) => {
    assert.doesNotMatch(workspace, /\*/, `unsupported workspace pattern: ${workspace}`);
    const result = execute(git, ['ls-files', '--', `${workspace}/package.json`]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `${workspace}/package.json`, `${workspace} has no tracked package.json`);
    return workspace;
  });
}

/**
 * The Node.js programs and test files that `make <target>` runs: the recipe lines of the target,
 * of its prerequisites and of the targets its recipe runs with `$(MAKE)` or `make`.
 */
export function makeNodeEntrypoints(targets: Record<string, MakeRule>, target: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(target)) return [];
  seen.add(target);
  const rule = targets[target];
  assert.ok(rule, `Makefile must define ${target}`);
  const reached = [
    ...rule.prerequisites,
    ...rule.commands.flatMap((command) => [...command.matchAll(/(?:\$\(MAKE\)|\bmake)\s+((?:-[^\s]+\s+)*)([\w.-]+)/g)]
      .map((match) => captured(match, 2))),
  ];
  return [...new Set([
    ...rule.commands.flatMap((command) => [
      ...[...command.matchAll(/\bnode(?:\s+--test)?\s+([^\s"']+\.m[jt]s)\b/g)].map((match) => captured(match, 1)),
      ...nodeTestArguments(command),
    ]),
    ...reached.flatMap((name) => makeNodeEntrypoints(targets, name, seen)),
  ])];
}

function nativeTestNodeEntrypoints(): string[] {
  // The tools of @polyspec/kit, $(KIT)/<tool>.mjs, import the dependencies of the kit package, not those of the root.
  const entrypoints = makeNodeEntrypoints(
    makeTargets(['Makefile', 'node_modules/@polyspec/kit/dist/kit.mk'].map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n')), 'crudui-test-native',
  ).filter((file) => !file.startsWith('$(KIT)/'));
  assert.notDeepEqual(entrypoints, [], 'make crudui-test-native runs no Node.js program');
  return entrypoints;
}

test('the Node.js programs of a target include those of its prerequisites and sub-makes', () => {
  const targets = makeTargets([
    'all: build', '\t@status=0; $(MAKE) --no-print-directory suite || status=1; exit $$status',
    'build:', '\tnode scripts/build.mjs', 'suite:', '\tnode $(KIT)/run-tests.mjs node -- a.test.mjs b.test.mjs', '',
  ].join('\n'));
  assert.deepEqual(makeNodeEntrypoints(targets, 'all').sort(),
    ['$(KIT)/run-tests.mjs', 'a.test.mjs', 'b.test.mjs', 'scripts/build.mjs']);
  assert.deepEqual(makeNodeEntrypoints(makeTargets('empty:\n\techo\n'), 'empty'), []);
});

function rootExampleEntrypoints(): string[] {
  const result = execute(git, [
    'ls-files', '--',
    'examples/form-comparison/*.mjs',
    'examples/form-comparison/**/*.mjs',
    'examples/cross-check-console/server/*.mjs',
  ]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter((filename) => (
    filename && existsSync(path.join(root, filename))
  ));
}

function importedPackageNames(filename: string): string[] {
  const source = readFileSync(path.join(root, filename), 'utf8');
  const specifiers = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => captured(match, 1));
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  return specifiers
    .filter((specifier) => (
      !specifier.startsWith('.')
      && !specifier.startsWith('/')
      && !specifier.startsWith('#')
      && !builtins.has(specifier)
      && !/^[A-Za-z][A-Za-z+.-]*:/.test(specifier)
    ))
    .map((specifier) => {
      if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
      const [name] = specifier.split('/');
      assert.ok(name !== undefined);
      return name;
    });
}

function packageApprovalFailures(lockFile: string) {
  const directory = path.dirname(path.join(root, lockFile));
  const manifestFile = path.join(directory, 'package.json');
  const manifest = readJson(manifestFile, packageSchema);
  const approvals = manifest.allowScripts ?? {};
  assert.equal(
    approvals !== null && typeof approvals === 'object' && !Array.isArray(approvals),
    true,
    `${lockFile}: allowScripts must be an object`,
  );

  const failures = [];
  for (const [key, approved] of Object.entries(approvals)) {
    const separator = key.lastIndexOf('@');
    const version = separator > 0 ? key.slice(separator + 1) : '';
    const exactVersions = version.split('||').map((part) => part.trim());
    if (approved !== true || exactVersions.some((part) => !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(part))) {
      failures.push({ key, approved });
    }
  }
  return failures;
}

test('installed packages form one valid dependency graph', () => {
  const result = executeNpm(['ls', '--all', '--json']);
  assert.equal(result.status, 0, [
    ...(result.report.problems ?? []),
    result.report.error?.summary,
    result.stderr,
  ].filter(Boolean).join('\n'));
});

test('workspace packages use the root dependency lock file', () => {
  const trackedLocks = new Set(trackedLockFiles());
  const failures = workspacePackageDirectories()
    .map((directory) => `${directory}/package-lock.json`)
    .filter((lockFile) => trackedLocks.has(lockFile));
  assert.deepEqual(failures, []);
});

test('native test root imports are declared by the root package', () => {
  const manifest = packageManifest('.');
  const workspaceNames = workspacePackageDirectories().map((directory) => {
    const workspace = packageManifest(directory);
    assert.equal(typeof workspace.name, 'string', `${directory}/package.json: missing name`);
    return workspace.name;
  });
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...workspaceNames,
  ]);
  const failures = nativeTestNodeEntrypoints().flatMap((filename) => (
    importedPackageNames(filename)
      .filter((packageName) => !declared.has(packageName))
      .map((packageName) => `${filename}: ${packageName}`)
  )).sort();
  assert.deepEqual(failures, []);
});

test('root example imports are declared by the root package', () => {
  const manifest = packageManifest('.');
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const failures = rootExampleEntrypoints().flatMap((filename) => (
    importedPackageNames(filename)
      .filter((packageName) => !declared.has(packageName))
      .map((packageName) => `${filename}: ${packageName}`)
  )).sort();
  assert.deepEqual(failures, []);
});

// The shared tools are the release asset of a tag of polyspec/kit, which the root package.json names by its URL and
// package-lock.json pins with its integrity; make install-packages allows the URLs of the root package.json alone.
const KIT_ASSET = /^https:\/\/github\.com\/polyspec\/kit\/releases\/download\/v(\d+\.\d+\.\d+)\/polyspec-kit-npm-\1\.tgz$/;

test('npm installs only registry packages, linked directories and the kit release asset, and fetches no other URL or Git source', () => {
  // A package comes from the npm registry, from a workspace or from a checkout that a make target installed, such
  // as the OrderedJSON tag checkout that the root package.json links with file:; npm fetches no URL or Git source other
  // than the release asset of @polyspec/kit that the root package.json names.
  const lock = readJson(path.join(root, 'package-lock.json'), lockSchema);
  const remote = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|git(?:\+[a-z]+)?:|github:|gitlab:|bitbucket:|gist:|[^@./][^/:]*\/[^/])/;
  const manifests = ['.', ...workspacePackageDirectories()].map((directory): [string, PackageManifest] => [directory, packageManifest(directory)]);
  const remoteDependencies = manifests.flatMap(([directory, manifest]) => [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
  ].filter(([packageName, specifier]) => remote.test(specifier) && !specifier.startsWith('npm:')
    && !(directory === '.' && packageName === '@polyspec/kit' && KIT_ASSET.test(specifier)))
    .map(([packageName, specifier]) => `${directory}: ${packageName} ${specifier}`));
  assert.deepEqual(remoteDependencies, []);

  const registry = 'https://registry.npmjs.org/';
  const unexpected = Object.entries(lock.packages ?? {}).flatMap(([location, entry]) => {
    if (location === '' || !location.includes('node_modules/')) return [];
    if (entry.link) {
      const target = path.resolve(root, entry.resolved ?? '');
      return target.startsWith(root + path.sep) ? [] : [`${location}: links ${entry.resolved}`];
    }
    const asset = location === 'node_modules/@polyspec/kit' && KIT_ASSET.test(entry.resolved ?? '');
    if (!entry.resolved?.startsWith(registry) && !asset) return [`${location}: resolves ${entry.resolved ?? 'nothing'}`];
    return /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? '') ? [] : [`${location}: no SHA-512 integrity`];
  });
  assert.deepEqual(unexpected, []);

  const configFile = path.join(root, '.npmrc');
  const config = existsSync(configFile) ? readFileSync(configFile, 'utf8') : '';
  const settings = Object.fromEntries(config.split('\n').flatMap((line): [string, string][] => {
    const match = line.match(/^\s*(allow-remote|allow-git)\s*=\s*([^#;\s]+)\s*(?:[#;].*)?$/);
    return match ? [[captured(match, 1), captured(match, 2)]] : [];
  }));
  assert.deepEqual(settings, { 'allow-remote': 'none', 'allow-git': 'none' });
});

test('form comparison commands use the root npm dependency graph', () => {
  const failures = [
    'examples/form-comparison/package.json',
    'examples/form-comparison/package-lock.json',
  ].filter((filename) => existsSync(path.join(root, filename)));
  assert.deepEqual(failures, []);
});

test('npm installs enforce script approvals', () => {
  // make install-packages runs npm ci; the .npmrc of the checkout sets strict-allow-scripts, so an install script that
  // allowScripts of package.json does not approve fails the install.
  const result = execute(npm, ['config', 'get', 'strict-allow-scripts']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'true');
});

// The development root requires the Composer packages of packages/ through path repositories with Composer's default
// link, so vendor/ loads each package from its source directory by the autoload of its own composer.json and no copy
// can fall behind its source.
test('Composer path repositories link the local packages', () => {
  const failures = [];
  for (const filename of trackedComposerFiles('composer.json')) {
    const manifest = readJson(path.join(root, filename), composerSchema);
    for (const [index, repository] of (manifest.repositories ?? []).entries()) {
      if (repository.type === 'path' && repository.options?.symlink === false) {
        failures.push(`${filename}:repositories[${index}]`);
      }
    }
  }
  for (const filename of trackedComposerFiles('composer.lock')) {
    const lock = readJson(path.join(root, filename), composerLockSchema);
    for (const dependency of [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])]) {
      if (dependency.dist?.type === 'path' && dependency['transport-options']?.symlink === false) {
        failures.push(`${filename}:${dependency.name}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('a published Composer package declares its version, and the development root requires that version', () => {
  const failures = [];
  for (const filename of trackedComposerFiles('composer.json')) {
    const manifest = readJson(path.join(root, filename), composerSchema);
    if (filename.startsWith('packages/') && !filename.includes('/vendor/') && manifest.type === 'library') {
      if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) failures.push(`${filename}: the published package declares no version X.Y.Z`);
      if (Object.hasOwn(manifest, 'repositories')) failures.push(`${filename}: the published package declares repositories`);
    }
    for (const [index, repository] of (manifest.repositories ?? []).entries()) {
      if (repository.type !== 'path') continue;
      assert.ok(repository.url !== undefined, `${filename}:repositories[${index}] is a path repository without url`);
      if (repository.url.includes('*')) continue;
      const targetFile = path.resolve(path.dirname(path.join(root, filename)),
        repository.url, 'composer.json');
      const target = readJson(targetFile, composerSchema);
      assert.ok(target.name !== undefined, `${targetFile} declares no name`);
      if (manifest.require?.[target.name] !== target.version) {
        failures.push(`${filename}:repositories[${index}] requires ${target.name} ${manifest.require?.[target.name]}, which declares ${target.version}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('config/dependency-policy.json records the OrderedJSON tag that the comparison installs', () => {
  const policy = readJson<Record<string, unknown>>(path.join(root, 'config/dependency-policy.json'), { values: {} });
  assert.deepEqual(policy['taggedNpmPackages'], [{
    directory: `${orderedJsonCheckout}/packages/js`, repository: orderedJsonRepository, tag: orderedJsonTag, version: orderedJsonVersion, fix: 'make crudui-install-ordered-json',
  }]);
});

test('tracked npm dependency graphs approve every install script by exact version', () => {
  const failures = [];
  for (const lockFile of trackedLockFiles()) {
    const directory = path.dirname(path.join(root, lockFile));
    const invalidApprovals = packageApprovalFailures(lockFile);
    const args = [
      'ci',
      '--dry-run',
      '--strict-allow-scripts',
      '--no-ignore-scripts',
      '--no-dangerously-allow-all-scripts',
      '--audit=false',
      '--fund=false',
      '--install-links=false',
    ];
    if (directory !== root) {
      args.push('--workspaces=false');
    }
    const result = execute(npm, args, directory);
    if (invalidApprovals.length > 0 || result.status !== 0) {
      failures.push({
        lockFile,
        invalidApprovals,
        installError: [result.stderr, result.stdout].filter(Boolean).join('\n').trim(),
      });
    }
  }
  assert.deepEqual(failures, []);
});
