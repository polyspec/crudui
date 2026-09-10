import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
let cachedRuntime;

function absolutePathEntries(environment) {
  const entries = (environment.PATH ?? '').split(path.delimiter).filter(Boolean);
  assert.ok(entries.length > 0, 'PATH must contain one package-manager directory');
  assert.ok(entries.every(entry => path.isAbsolute(entry)), 'PATH entries must be absolute');
  return [...new Set(entries)];
}

async function existingType(file, lstatFile) {
  try {
    return await lstatFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertRegularPath(file, expected, lstatFile) {
  assert.ok(path.isAbsolute(file), 'Resolved runtime paths must be absolute');
  const parsed = path.parse(file);
  let current = parsed.root;
  for (const segment of file.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const value = await existingType(current, lstatFile);
    assert.ok(value, 'Resolved runtime path is missing: ' + current);
    assert.equal(value.isSymbolicLink(), false,
      'Resolved runtime path uses a symbolic link; symbolic links are not allowed: ' + current);
    if (current === file) {
      assert.equal(expected === 'file' ? value.isFile() : value.isDirectory(), true,
        'Resolved runtime path has the wrong type: ' + current);
    } else {
      assert.equal(value.isDirectory(), true,
        'Resolved runtime parent is not a directory: ' + current);
    }
  }
}

async function discoverBrew(environment, lstatFile, accessFile) {
  const candidates = [];
  for (const directory of absolutePathEntries(environment)) {
    const candidate = path.join(directory, 'brew');
    const value = await existingType(candidate, lstatFile);
    if (!value) continue;
    assert.equal(value.isSymbolicLink(), false,
      'Package-manager path uses a symbolic link; symbolic links are not allowed: ' + candidate);
    assert.equal(value.isFile(), true,
      'Package-manager path is not a regular file: ' + candidate);
    await assertRegularPath(candidate, 'file', lstatFile);
    await accessFile(candidate, constants.X_OK);
    candidates.push(candidate);
  }
  assert.equal(candidates.length, 1,
    'Runtime resolution requires exactly one regular brew executable');
  return candidates[0];
}

function installedVersion(output) {
  const value = JSON.parse(output);
  assert.deepEqual(value.casks ?? [], [], 'Container runtime must be installed as one formula');
  assert.ok(Array.isArray(value.formulae), 'Container package record is invalid');
  const formulae = value.formulae.filter(item => item.name === 'container');
  assert.equal(formulae.length, 1, 'Container package record must contain one formula');
  const formula = formulae[0];
  assert.ok(Array.isArray(formula.installed), 'Container installed-version record is invalid');
  assert.equal(formula.installed.length, 1,
    'Runtime resolution requires exactly one installed container version');
  const version = formula.installed[0]?.version;
  assert.match(version ?? '', /^[0-9A-Za-z][0-9A-Za-z._-]*$/,
    'Installed container version is invalid');
  assert.equal(formula.linked_keg, version,
    'Linked container version differs from the installed version');
  return version;
}

export async function resolveContainerRuntime({
  environment = process.env, lstatFile = lstat, accessFile = access, execute = execFile,
} = {}) {
  const brew = await discoverBrew(environment, lstatFile, accessFile);
  const { stdout: recordOutput } = await execute(
    brew, ['info', '--json=v2', 'container'], { encoding: 'utf8' },
  );
  const version = installedVersion(recordOutput);
  const { stdout: cellarOutput } = await execute(
    brew, ['--cellar', 'container'], { encoding: 'utf8' },
  );
  const cellar = cellarOutput.trim();
  assert.ok(path.isAbsolute(cellar), 'Container Cellar path must be absolute');
  const installation = path.join(cellar, version);
  const executable = path.join(installation, 'libexec/container');
  await assertRegularPath(executable, 'file', lstatFile);
  await accessFile(executable, constants.X_OK);
  return {
    executable,
    environment: { CONTAINER_INSTALL_ROOT: installation },
  };
}

export async function containerRuntime() {
  cachedRuntime ??= resolveContainerRuntime();
  return cachedRuntime;
}

export async function runContainer(args, options = {}) {
  const runtime = await containerRuntime();
  const { env = process.env, ...executionOptions } = options;
  return execFile(runtime.executable, args, {
    encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...executionOptions,
    env: { ...env, ...runtime.environment },
  });
}
