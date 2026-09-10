#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertExecutable,
  assertRegularPath,
  pathState,
  resolveExecutable,
  resolveRustToolchain,
  runCommand,
  verifyVersion,
} from './tool-resolution.mjs';

export { assertRegularPath, runCommand } from './tool-resolution.mjs';

function dependencyNames(value) {
  return value.split(',').flatMap(clause => clause.split('|')).map(item => {
    const match = item.trim().match(
      /^([a-z0-9][a-z0-9+.-]*)(?::[a-z0-9][a-z0-9-]*)?(?:\s|\(|$)/,
    );
    return match?.[1];
  }).filter(Boolean);
}

function versionedGccDependency(value) {
  const names = dependencyNames(value).filter(name => /^gcc-\d+$/.test(name));
  assert.equal(names.length, 1,
    'The gcc package must declare one versioned compiler dependency');
  return names[0];
}

function targetGccDependency(value, versionedPackage) {
  const version = versionedPackage.slice('gcc-'.length);
  const pattern = new RegExp('^gcc-' + version + '-[a-z0-9]+(?:-[a-z0-9]+){2,}$');
  const names = dependencyNames(value).filter(name => pattern.test(name));
  assert.equal(names.length, 1,
    'The ' + versionedPackage + ' package must declare one target compiler dependency');
  return names[0];
}

function installedPackageStatus(value, packageName) {
  assert.equal(value.trim(), 'ii', packageName + ' must be installed');
}

async function regularTargetCompilers(value, packageName) {
  const versionMatch = packageName.match(/^gcc-(\d+)-/);
  assert.ok(versionMatch, 'Target compiler package name is invalid: ' + packageName);
  const version = versionMatch[1];
  const pattern = new RegExp('^[a-z0-9_]+(?:-[a-z0-9_]+)+-gcc-' + version + '$');
  const candidates = [];
  for (const filename of value.split(/\r?\n/).filter(Boolean)) {
    if (!path.isAbsolute(filename) || !pattern.test(path.basename(filename))) continue;
    await assertExecutable(filename, 'C compiler');
    candidates.push(filename);
  }
  return [...new Set(candidates)];
}

/** Resolve one regular target compiler from the installed Debian gcc package record. */
export async function resolveDebianCompiler(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.run ?? runCommand;
  const packageQuery = options.packageQuery ?? '/usr/bin/dpkg-query';
  await assertExecutable(packageQuery, 'dpkg-query');
  const gccStatus = await run(packageQuery,
    ['-W', '-f=' + '${db:Status-Abbrev}\n' + '${Depends}\n', 'gcc'],
    { capture: true, environment });
  const [status, ...dependencyLines] = gccStatus.stdout.split(/\r?\n/);
  installedPackageStatus(status, 'gcc');
  const versionedPackage = versionedGccDependency(dependencyLines.join(' '));
  const versionedStatus = await run(packageQuery,
    ['-W', '-f=' + '${db:Status-Abbrev}\n' + '${Depends}\n', versionedPackage],
    { capture: true, environment });
  const [versionedState, ...versionedDependencies] = versionedStatus.stdout.split(/\r?\n/);
  installedPackageStatus(versionedState, versionedPackage);
  const targetPackage = targetGccDependency(
    versionedDependencies.join(' '), versionedPackage,
  );
  const targetStatus = await run(packageQuery,
    ['-W', '-f=' + '${db:Status-Abbrev}\n', targetPackage],
    { capture: true, environment });
  installedPackageStatus(targetStatus.stdout, targetPackage);
  const packageFiles = await run(packageQuery, ['-L', targetPackage], {
    capture: true,
    environment,
  });
  const compilers = await regularTargetCompilers(packageFiles.stdout, targetPackage);
  assert.equal(compilers.length, 1,
    'The ' + targetPackage + ' package must contain one regular target compiler; received '
      + compilers.length);
  await verifyVersion(compilers[0], /(?:gcc|GCC)/, run, environment);
  return compilers[0];
}

/** Resolve every executable before a PHP extension build starts. */
export async function resolvePhpBuildTools(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.run ?? runCommand;
  const platform = options.platform ?? process.platform;
  const phpConfig = await resolveExecutable('php-config', options.phpConfig, 'php-config',
    environment, run, /^\d+\.\d+\.\d+/);
  const compiler = options.compiler
    ? await resolveExecutable('cc', options.compiler, 'C compiler',
      environment, run, /(?:clang|gcc|cc)/i)
    : platform === 'linux'
      ? await resolveDebianCompiler({
        environment, run, packageQuery: options.packageQuery,
      })
      : await resolveExecutable('cc', undefined, 'C compiler',
        environment, run, /(?:clang|gcc|cc)/i);
  if (!options.needsCargo) return { phpConfig, compiler };
  const rust = await resolveRustToolchain({
    cargo: options.cargo, cwd: options.cwd, environment, run,
    rustc: options.rustc, rustdoc: options.rustdoc,
  });
  return { phpConfig, compiler, ...rust };
}

function installedHomebrewVersion(output) {
  const record = JSON.parse(output);
  assert.deepEqual(record.casks ?? [], [], 'PHP must be installed as one formula');
  assert.ok(Array.isArray(record.formulae), 'PHP package record is invalid');
  const formulae = record.formulae.filter(formula => formula.name === 'php');
  assert.equal(formulae.length, 1, 'PHP package record must contain one formula');
  const formula = formulae[0];
  assert.ok(Array.isArray(formula.installed), 'PHP installed-version record is invalid');
  assert.equal(formula.installed.length, 1,
    'PHP discovery requires one installed version');
  const version = formula.installed[0]?.version;
  assert.match(version ?? '', /^[0-9][0-9A-Za-z._-]*$/, 'Installed PHP version is invalid');
  assert.equal(formula.linked_keg, version,
    'Linked PHP version differs from the installed version');
  return version;
}

/** Resolve php-config from one Homebrew installation record on macOS. */
export async function resolveHomebrewPhpConfig(options = {}) {
  const environment = options.environment ?? process.env;
  const run = options.run ?? runCommand;
  const brew = await discoverOneExecutable('brew', environment);
  const packageRecord = await run(brew, ['info', '--json=v2', 'php'], {
    capture: true, environment,
  });
  const version = installedHomebrewVersion(packageRecord.stdout);
  const cellarRecord = await run(brew, ['--cellar', 'php'], {
    capture: true, environment,
  });
  const cellar = cellarRecord.stdout.trim();
  await assertRegularPath(cellar, 'directory');
  const phpConfig = path.join(cellar, version, 'bin', 'php-config');
  await assertExecutable(phpConfig, 'php-config');
  return phpConfig;
}

function parseShellWords(value) {
  const words = [];
  let word = '';
  let quote = null;
  let escaping = false;
  let started = false;
  for (const character of value) {
    if (escaping) {
      word += character;
      escaping = false;
      started = true;
    } else if (character === '\\' && quote !== "'") {
      escaping = true;
      started = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else word += character;
      started = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        words.push(word);
        word = '';
        started = false;
      }
    } else {
      word += character;
      started = true;
    }
  }
  assert.equal(escaping, false, 'PHP build flags end with an escape');
  assert.equal(quote, null, 'PHP build flags contain an unterminated quote');
  if (started) words.push(word);
  return words;
}

async function phpConfigValue(executable, option, run, environment) {
  const result = await run(executable, [option], { capture: true, environment });
  const value = result.stdout.trim();
  assert.ok(value.length > 0, 'php-config ' + option + ' returned an empty value');
  return value;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith('..' + path.sep));
}

function includePaths(value) {
  const tokens = parseShellWords(value);
  const includes = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-I') {
      index += 1;
      assert.ok(tokens[index], 'PHP include flag requires a path');
      includes.push(tokens[index]);
    } else {
      assert.ok(token.startsWith('-I') && token.length > 2,
        'Unsupported php-config include flag: ' + token);
      includes.push(token.slice(2));
    }
  }
  assert.ok(includes.length > 0, 'php-config --includes must return include paths');
  return [...new Set(includes)];
}

/** Read and verify one PHP installation through php-config and its PHP executable. */
export async function readPhpMetadata(phpConfig, options = {}) {
  const run = options.run ?? runCommand;
  const environment = options.environment ?? process.env;
  await assertExecutable(phpConfig, 'php-config');
  const [prefixInput, includesInput, versionInput, executableInput] = await Promise.all([
    phpConfigValue(phpConfig, '--prefix', run, environment),
    phpConfigValue(phpConfig, '--includes', run, environment),
    phpConfigValue(phpConfig, '--vernum', run, environment),
    phpConfigValue(phpConfig, '--php-binary', run, environment),
  ]);
  assert.match(versionInput, /^\d+$/, 'php-config --vernum must return an integer');
  const version = Number(versionInput);
  assert.ok(Number.isSafeInteger(version) && version >= options.minimumVersion,
    'PHP version does not satisfy the extension requirement');

  const prefix = await assertRegularPath(prefixInput, 'directory');
  assert.equal(inside(prefix, phpConfig), true,
    'php-config must belong to the declared PHP installation');
  const executable = await assertExecutable(executableInput, 'PHP');
  assert.equal(inside(prefix, executable), true,
    'PHP executable must belong to the php-config installation');
  const includeDirectories = includePaths(includesInput);
  for (const directory of includeDirectories) {
    await assertRegularPath(directory, 'directory');
    assert.equal(inside(prefix, directory), true,
      'PHP headers must belong to the php-config installation');
  }

  const runtime = await run(executable, ['-n', '-r',
    'echo json_encode([PHP_VERSION_ID, PHP_INT_SIZE, PHP_ZTS, PHP_DEBUG], JSON_THROW_ON_ERROR);',
  ], { capture: true, environment });
  const details = JSON.parse(runtime.stdout);
  assert.ok(Array.isArray(details) && details.length === 4,
    'PHP runtime metadata is invalid');
  assert.equal(details[0], version, 'PHP binary and development metadata differ');
  if (options.require64Bit) {
    assert.equal(details[1], 8, 'The extension requires 64-bit PHP');
  }
  assert.equal(typeof details[2], 'boolean', 'PHP_ZTS must be a boolean');
  assert.equal(typeof details[3], 'boolean', 'PHP_DEBUG must be a boolean');

  return {
    prefix,
    includeArguments: includeDirectories.map(directory => '-I' + directory),
    executable,
    version,
    zts: details[2],
    debug: details[3],
  };
}

async function assertGeneratedTree(filename) {
  const state = await lstat(filename);
  assert.equal(state.isSymbolicLink(), false,
    'Generated path is a symbolic link: ' + filename);
  assert.ok(state.isFile() || state.isDirectory(),
    'Generated path has an unsupported type: ' + filename);
  if (!state.isDirectory()) return;
  for (const entry of await readdir(filename, { withFileTypes: true })) {
    const child = path.join(filename, entry.name);
    assert.equal(entry.isSymbolicLink(), false,
      'Generated path is a symbolic link: ' + child);
    assert.ok(entry.isFile() || entry.isDirectory(),
      'Generated path has an unsupported type: ' + child);
    if (entry.isDirectory()) await assertGeneratedTree(child);
  }
}

function generatedTarget(root, relative) {
  assert.ok(relative.length > 0 && !path.isAbsolute(relative),
    'Generated paths must be nonempty relative paths');
  assert.equal(path.normalize(relative), relative, 'Generated path must be normalized: ' + relative);
  const target = path.join(root, relative);
  assert.equal(inside(root, target) && target !== root, true,
    'Generated path must remain inside its source root: ' + relative);
  return target;
}

async function assertGeneratedTarget(root, target) {
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const state = await pathState(current);
    if (!state) return false;
    assert.equal(state.isSymbolicLink(), false,
      'Generated path is a symbolic link: ' + current);
    if (current !== target) {
      assert.equal(state.isDirectory(), true,
        'Generated path parent is not a directory: ' + current);
    }
  }
  await assertGeneratedTree(target);
  return true;
}

/** Remove only declared generated paths after rejecting every symbolic link. */
export async function cleanGeneratedPaths(root, relativePaths) {
  await assertRegularPath(root, 'directory');
  const targets = [...new Set(relativePaths)].map(relative => generatedTarget(root, relative));
  const existing = [];
  for (const target of targets) {
    if (await assertGeneratedTarget(root, target)) existing.push(target);
  }
  await Promise.all(existing.map(target => rm(target, { recursive: true, force: true })));
}

function validateDescriptor(descriptor) {
  assert.match(descriptor.moduleName, /^[a-z][a-z0-9_]*$/,
    'PHP module name is invalid');
  assert.ok(Array.isArray(descriptor.sources) && descriptor.sources.length > 0,
    'PHP extension sources are required');
  assert.ok(Array.isArray(descriptor.generatedPaths),
    'Generated path declarations are required');
  assert.ok(Array.isArray(descriptor.compilerArguments ?? []),
    'Compiler argument declarations must be an array');
  assert.ok(Number.isSafeInteger(descriptor.minimumPhpVersion),
    'Minimum PHP version is required');
  assert.ok(Array.isArray(descriptor.loadChecks) && descriptor.loadChecks.length > 0,
    'PHP module load checks are required');
}

function declaredSource(root, relative) {
  assert.ok(relative.length > 0 && !path.isAbsolute(relative),
    'Source paths must be nonempty relative paths');
  assert.equal(path.normalize(relative), relative, 'Source path must be normalized: ' + relative);
  const source = path.join(root, relative);
  assert.equal(inside(root, source), true, 'Source path must remain inside its declared root');
  return source;
}

function macosDeploymentTarget(environment) {
  const value = environment.MACOSX_DEPLOYMENT_TARGET ?? '11.0';
  assert.match(value, /^\d+(?:\.\d+){1,2}$/,
    'MACOSX_DEPLOYMENT_TARGET must contain a version');
  return value;
}

function buildJobs(environment) {
  const value = environment.CRUDUI_BUILD_JOBS;
  if (value === undefined) return null;
  assert.match(value, /^[1-9]\d*$/, 'CRUDUI_BUILD_JOBS must be a positive integer');
  return value;
}

/** Compile, link and load one explicitly declared PHP extension. */
export async function buildPhpExtension(descriptor, options = {}) {
  validateDescriptor(descriptor);
  const run = options.run ?? runCommand;
  const environment = { ...(options.environment ?? process.env) };
  const platform = options.platform ?? process.platform;
  assert.ok(platform === 'linux' || platform === 'darwin',
    'Unsupported PHP extension platform: ' + platform);
  const sourceRoot = await assertRegularPath(descriptor.sourceRoot, 'directory');

  const tools = options.tools ?? await resolvePhpBuildTools({
    cwd: sourceRoot,
    environment,
    run,
    phpConfig: options.phpConfig,
    compiler: options.compiler,
    cargo: options.cargo,
    rustc: options.rustc,
    rustdoc: options.rustdoc,
    platform,
    needsCargo: descriptor.needsCargo,
  });
  await assertExecutable(tools.phpConfig, 'php-config');
  await assertExecutable(tools.compiler, 'C compiler');
  if (descriptor.needsCargo) {
    await assertExecutable(tools.cargo, 'Cargo');
    await assertExecutable(tools.rustc, 'rustc');
    await assertExecutable(tools.rustdoc, 'rustdoc');
    assert.match(tools.rustHost, /^[a-z0-9_]+(?:-[a-z0-9_]+)+$/,
      'Rust host target is invalid');
  }
  const php = await readPhpMetadata(tools.phpConfig, {
    environment,
    minimumVersion: descriptor.minimumPhpVersion,
    require64Bit: descriptor.require64Bit,
    run,
  });

  for (const source of descriptor.sources) {
    await assertRegularPath(declaredSource(sourceRoot, source), 'file');
  }
  for (const directory of descriptor.includeDirectories ?? []) {
    await assertRegularPath(declaredSource(sourceRoot, directory), 'directory');
  }
  await cleanGeneratedPaths(sourceRoot, descriptor.generatedPaths);

  const buildDirectory = declaredSource(sourceRoot, descriptor.buildDirectory ?? '.build');
  const objectDirectory = path.join(buildDirectory, 'objects');
  const moduleDirectory = declaredSource(sourceRoot, descriptor.outputDirectory ?? 'modules');
  await Promise.all([
    mkdir(objectDirectory, { recursive: true }),
    mkdir(moduleDirectory, { recursive: true }),
  ]);
  await assertRegularPath(objectDirectory, 'directory');
  await assertRegularPath(moduleDirectory, 'directory');

  const commandEnvironment = { ...environment };
  const platformCompileArguments = [];
  const platformLinkArguments = [];
  let deploymentTarget = null;
  if (platform === 'darwin') {
    deploymentTarget = macosDeploymentTarget(environment);
    commandEnvironment.MACOSX_DEPLOYMENT_TARGET = deploymentTarget;
    platformCompileArguments.push('-mmacosx-version-min=' + deploymentTarget);
    platformLinkArguments.push('-mmacosx-version-min=' + deploymentTarget);
  }

  const prepared = descriptor.prepare
    ? await descriptor.prepare({
      buildDirectory,
      commandEnvironment,
      deploymentTarget,
      jobs: buildJobs(environment),
      platform,
      run,
      sourceRoot,
      tools,
    })
    : {};
  const definitions = [...(descriptor.definitions ?? [])];
  if (php.zts) definitions.push('ZTS=1');
  if (php.debug) definitions.push('ZEND_DEBUG=1');
  const compileArguments = [
    '-std=c11', '-fPIC', '-O2', '-Wall', '-Wextra', '-Werror', '-D_GNU_SOURCE',
    ...(descriptor.compilerArguments ?? []),
    ...platformCompileArguments,
    ...php.includeArguments,
    ...(descriptor.includeDirectories ?? []).map(directory =>
      '-I' + declaredSource(sourceRoot, directory)),
    ...definitions.map(definition => '-D' + definition),
  ];
  const objects = descriptor.sources.map((source, index) =>
    path.join(objectDirectory, String(index) + '-' + path.basename(source, path.extname(source)) + '.o'));
  await Promise.all(descriptor.sources.map((source, index) => run(tools.compiler, [
    ...compileArguments,
    '-c', declaredSource(sourceRoot, source),
    '-o', objects[index],
  ], { cwd: sourceRoot, environment: commandEnvironment })));
  await assertGeneratedTree(objectDirectory);

  const module = path.join(moduleDirectory, descriptor.moduleName + '.so');
  const extraObjects = prepared.objects ?? [];
  for (const filename of extraObjects) await assertRegularPath(filename, 'file');
  const libraries = platform === 'darwin'
    ? descriptor.macosLibraries ?? []
    : descriptor.linuxLibraries ?? [];
  const linkArguments = platform === 'darwin'
    ? ['-bundle', '-undefined', 'dynamic_lookup', ...platformLinkArguments,
      '-o', module, ...objects, ...extraObjects, ...libraries]
    : ['-shared', '-o', module, ...objects, ...extraObjects, ...libraries];
  await run(tools.compiler, linkArguments, {
    cwd: sourceRoot,
    environment: commandEnvironment,
  });
  await assertRegularPath(module, 'file');

  const loaded = await run(php.executable,
    ['-n', '-d', 'extension=' + module, '--ri', descriptor.moduleName],
    { capture: true, environment: commandEnvironment });
  for (const pattern of descriptor.loadChecks) {
    assert.match(loaded.stdout, pattern,
      'PHP module load output does not satisfy ' + descriptor.moduleName);
  }

  const manifest = path.join(buildDirectory, 'build.json');
  await writeFile(manifest, JSON.stringify({
    module: descriptor.moduleName,
    platform,
    php: { executable: php.executable, version: php.version },
    tools,
    macosDeploymentTarget: deploymentTarget,
  }, null, 2) + '\n');
  await assertGeneratedTree(buildDirectory);
  await assertGeneratedTree(moduleDirectory);
  process.stdout.write('PHP extension built and loaded: ' + module + '\n');
  return { buildDirectory, module, php, tools };
}

/** Reject duplicate CLI and environment declarations for one explicit input. */
export function declaredValue(variableName, argument, environment = process.env) {
  const variable = environment[variableName];
  if (argument !== undefined && variable !== undefined) {
    throw new Error(variableName + ' and its command argument cannot both be set');
  }
  return argument ?? variable;
}
