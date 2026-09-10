import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
let cachedExecutable;

async function executable(file, accessFile) {
  try {
    await accessFile(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fromPath(name, environment, accessFile) {
  for (const directory of (environment.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const file = path.join(directory, name);
    if (await executable(file, accessFile)) return file;
  }
  return null;
}

export async function resolveContainerExecutable({
  environment = process.env, accessFile = access, execute = execFile,
} = {}) {
  if (environment.CONTAINER_BIN) {
    assert.ok(path.isAbsolute(environment.CONTAINER_BIN),
      'CONTAINER_BIN must contain an absolute path');
    assert.ok(await executable(environment.CONTAINER_BIN, accessFile),
      'CONTAINER_BIN is not executable');
    return environment.CONTAINER_BIN;
  }

  const direct = await fromPath('container', environment, accessFile);
  if (direct) return direct;

  const brew = await fromPath('brew', environment, accessFile);
  if (brew) {
    try {
      const { stdout } = await execute(brew, ['--prefix', 'container'], { encoding: 'utf8' });
      const installed = path.join(stdout.trim(), 'bin/container');
      if (path.isAbsolute(installed) && await executable(installed, accessFile)) return installed;
    } catch {
      // The final error reports the missing runtime without exposing package-manager output.
    }
  }
  throw new Error('The container executable is not available; set CONTAINER_BIN to its absolute path');
}

export async function containerExecutable() {
  cachedExecutable ??= resolveContainerExecutable();
  return cachedExecutable;
}

export async function runContainer(args, options = {}) {
  return execFile(await containerExecutable(), args, {
    encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...options,
  });
}

