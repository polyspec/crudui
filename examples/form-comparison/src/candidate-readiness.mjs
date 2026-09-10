import assert from 'node:assert/strict';
import { watch } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

async function pathState(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertAvailable(file) {
  assert.equal(await pathState(file), null,
    'Candidate readiness path already exists');
}

async function readReadiness(file, expected) {
  const state = await lstat(file);
  assert.equal(state.isSymbolicLink(), false,
    'Candidate readiness path must not be a symbolic link');
  assert.equal(state.isFile(), true,
    'Candidate readiness path must be a regular file');
  const value = JSON.parse(await readFile(file, 'utf8'));
  try {
    assert.deepEqual(value, expected);
  } catch (error) {
    throw new Error('Candidate readiness contents differ', { cause: error });
  }
  return value;
}

function exitDescription(result) {
  return result?.signal ?? result?.code ?? 'unknown';
}

/** Wait for one new readiness file or the attached container process exit. */
export async function waitForCandidateReadiness({ file, expected, start,
  watchDirectory = watch }) {
  assert.ok(typeof file === 'string' && path.isAbsolute(file),
    'Candidate readiness path must be absolute');
  assert.deepEqual(expected?.servers, ['php', 'php-ext', 'go', 'rust'],
    'Candidate readiness requires the four current servers');
  assert.match(expected?.commit ?? '', /^[0-9a-f]{40}$/,
    'Candidate readiness commit is invalid');
  assert.equal(typeof start, 'function',
    'Candidate readiness requires one container start operation');

  const parent = path.dirname(file);
  assert.equal(await realpath(parent), parent,
    'Candidate readiness path must not contain symbolic links');
  const parentState = await lstat(parent);
  assert.equal(parentState.isDirectory(), true,
    'Candidate readiness parent must be a directory');
  await assertAvailable(file);

  let resolveReadiness;
  let rejectReadiness;
  let settled = false;
  let observing = false;
  let pending = false;
  const readiness = new Promise((resolve, reject) => {
    resolveReadiness = resolve;
    rejectReadiness = reject;
  });
  const basename = path.basename(file);
  async function observe() {
    if (observing || settled) return;
    observing = true;
    try {
      while (pending && !settled) {
        pending = false;
        if (await pathState(file) === null) continue;
        settled = true;
        resolveReadiness(await readReadiness(file, expected));
      }
    } catch (error) {
      settled = true;
      rejectReadiness(error);
    } finally {
      observing = false;
    }
  }
  const watcher = watchDirectory(parent, (_event, filename) => {
    if (filename !== null && filename !== undefined
        && String(filename) !== basename) return;
    if (settled) return;
    pending = true;
    observe();
  });
  watcher.once('error', error => {
    if (settled) return;
    settled = true;
    rejectReadiness(new Error('Candidate readiness watch failed', { cause: error }));
  });

  try {
    await assertAvailable(file);
    const started = await start();
    assert.ok(started?.completion && typeof started.completion.then === 'function',
      'Candidate start must return a completion promise');
    const exit = started.completion.then(result => {
      throw new Error('Candidate container exited before readiness: '
        + exitDescription(result));
    }, error => {
      throw new Error('Candidate container failed before readiness', { cause: error });
    });
    return await Promise.race([readiness, exit]);
  } finally {
    watcher.close();
  }
}
