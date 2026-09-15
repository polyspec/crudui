import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const git = process.platform === 'win32' ? 'git.exe' : 'git';

function execute(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function executeNpm(args, cwd = root) {
  const result = execute(npm, args, cwd);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    assert.fail([
      `npm ${args.join(' ')} did not return JSON:`,
      result.stdout,
      result.stderr,
    ].join('\n'));
  }
  return { ...result, report };
}

function trackedLockFiles() {
  const result = execute(git, ['ls-files', '--', 'package-lock.json', '**/package-lock.json']);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function trackedComposerFiles(basename) {
  const result = execute(git, ['ls-files', '--', basename, `**/${basename}`]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function trackedInstallDefinitionFiles() {
  const result = execute(git, ['ls-files']);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter((filename) => (
    (/^\.github\/workflows\/.*\.ya?ml$/).test(filename)
      || (/(?:^|\/)[^/]*(?:Containerfile|Dockerfile)$/).test(filename)
  )).sort();
}

function workspacePackageDirectories() {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  return manifest.workspaces.flatMap((workspace) => {
    assert.match(workspace, /\/\*$/, `unsupported workspace pattern: ${workspace}`);
    const parent = workspace.slice(0, -2);
    const result = execute(git, ['ls-files', '--', `${parent}/*/package.json`]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split('\n').filter(Boolean).map(path.dirname);
  });
}

function nativeTestNodeEntrypoints() {
  const makefile = readFileSync(path.join(root, 'Makefile'), 'utf8');
  const target = makefile.match(/^test-native:[^\n]*\n((?:\t[^\n]*\n?)*)/m);
  assert.ok(target, 'Makefile must define test-native');
  return [...target[1].matchAll(/\bnode(?:\s+--test)?\s+([^\s"']+\.mjs)\b/g)]
    .map((match) => match[1]);
}

function rootExampleEntrypoints() {
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

function importedPackageNames(filename) {
  const source = readFileSync(path.join(root, filename), 'utf8');
  const specifiers = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  return specifiers
    .filter((specifier) => (
      !specifier.startsWith('.')
      && !specifier.startsWith('/')
      && !specifier.startsWith('#')
      && !builtins.has(specifier)
      && !/^[A-Za-z][A-Za-z+.-]*:/.test(specifier)
    ))
    .map((specifier) => (
      specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]
    ));
}

function packageApprovalFailures(lockFile) {
  const directory = path.dirname(path.join(root, lockFile));
  const manifestFile = path.join(directory, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
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
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const workspaceNames = workspacePackageDirectories().map((directory) => {
    const workspace = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
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
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
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

test('root URL dependencies permit only root npm remote fetches', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const remoteDependencies = [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
  ].filter(([, specifier]) => /^https?:\/\//.test(specifier));
  assert.ok(remoteDependencies.length > 0, 'root package must declare a URL dependency');
  for (const [packageName, specifier] of remoteDependencies) {
    assert.match(specifier, /[0-9a-f]{40}(?:[/?#]|$)/,
      `${packageName}: URL dependency must identify one source revision`);
    const locked = lock.packages?.[`node_modules/${packageName}`];
    assert.equal(locked?.resolved, specifier,
      `${packageName}: lock file must retain the declared URL`);
    assert.match(locked?.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/,
      `${packageName}: lock file must record SHA-512 integrity`);
  }

  const workspaceRemoteDependencies = workspacePackageDirectories().flatMap((directory) => {
    const workspace = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
    return [
      ...Object.entries(workspace.dependencies ?? {}),
      ...Object.entries(workspace.devDependencies ?? {}),
      ...Object.entries(workspace.optionalDependencies ?? {}),
    ].filter(([, specifier]) => /^https?:\/\//.test(specifier))
      .map(([packageName]) => `${directory}: ${packageName}`);
  });
  assert.deepEqual(workspaceRemoteDependencies, []);

  const configFile = path.join(root, '.npmrc');
  const config = existsSync(configFile) ? readFileSync(configFile, 'utf8') : '';
  const policies = config.split('\n').flatMap((line) => {
    const match = line.match(/^\s*allow-remote\s*=\s*([^#;\s]+)\s*(?:[#;].*)?$/);
    return match ? [match[1]] : [];
  });
  assert.deepEqual(policies, ['root']);
});

test('form comparison commands use the root npm dependency graph', () => {
  const container = readFileSync(
    path.join(root, 'examples/form-comparison/Containerfile'), 'utf8',
  );
  const failures = [
    'examples/form-comparison/package.json',
    'examples/form-comparison/package-lock.json',
  ].filter((filename) => existsSync(path.join(root, filename)));
  if (/npm ci[^\n]*--prefix examples\/form-comparison/.test(container)) {
    failures.push('examples/form-comparison/Containerfile: nested npm install');
  }
  assert.deepEqual(failures, []);
});

test('CI and container clean installs enforce script approvals', () => {
  const failures = [];
  for (const filename of trackedInstallDefinitionFiles()) {
    const lines = readFileSync(path.join(root, filename), 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (/\bnpm ci(?!\s+--strict-allow-scripts\b)/.test(line)) {
        failures.push(`${filename}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('container Composer installs declare the repository package version', () => {
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const failures = trackedInstallDefinitionFiles().filter((filename) => {
    if (!/(?:^|\/)[^/]*(?:Containerfile|Dockerfile)$/.test(filename)) return false;
    const source = readFileSync(path.join(root, filename), 'utf8');
    return /\bcomposer(?:\s+--[^\s]+)*\s+install\b/.test(source)
      && !new RegExp('\\bCOMPOSER_ROOT_VERSION=' + version.replaceAll('.', '\\.')
        + '\\b').test(source);
  });
  assert.deepEqual(failures, []);
});

test('Composer path repositories install local packages as copies', () => {
  const failures = [];
  for (const filename of trackedComposerFiles('composer.json')) {
    const manifest = JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
    for (const [index, repository] of (manifest.repositories ?? []).entries()) {
      if (repository.type === 'path' && repository.options?.symlink !== false) {
        failures.push(`${filename}:repositories[${index}]`);
      }
    }
  }
  for (const filename of trackedComposerFiles('composer.lock')) {
    const lock = JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
    for (const dependency of [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])]) {
      if (dependency.dist?.type === 'path'
        && dependency['transport-options']?.symlink !== false) {
        failures.push(`${filename}:${dependency.name}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('Composer package versions come from repository metadata', () => {
  const failures = [];
  for (const filename of trackedComposerFiles('composer.json')) {
    const manifest = JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
    if (filename.startsWith('packages/') && !filename.includes('/vendor/')
      && manifest.type === 'library' && Object.hasOwn(manifest, 'version')) {
      failures.push(`${filename}: library declares its own version`);
    }
    for (const [index, repository] of (manifest.repositories ?? []).entries()) {
      if (repository.type !== 'path' || repository.url.includes('*')) continue;
      const targetFile = path.resolve(path.dirname(path.join(root, filename)),
        repository.url, 'composer.json');
      const target = JSON.parse(readFileSync(targetFile, 'utf8'));
      const version = repository.options?.versions?.[target.name];
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')
        || manifest.require?.[target.name] !== version) {
        failures.push(`${filename}:repositories[${index}] does not declare the required version`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('tracked npm lock files have no moderate or higher vulnerability', () => {
  const failures = [];
  for (const lockFile of trackedLockFiles()) {
    const directory = path.dirname(path.join(root, lockFile));
    const result = executeNpm([
      'audit', '--package-lock-only', '--audit-level=moderate', '--json',
    ], directory);
    const counts = result.report.metadata?.vulnerabilities;
    assert.ok(counts, `${lockFile}: npm audit did not return vulnerability counts`);
    if (result.status !== 0 || counts.moderate + counts.high + counts.critical !== 0) {
      failures.push({
        lockFile,
        vulnerabilities: counts,
        packages: Object.keys(result.report.vulnerabilities ?? {}),
      });
    }
  }
  assert.deepEqual(failures, []);
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
