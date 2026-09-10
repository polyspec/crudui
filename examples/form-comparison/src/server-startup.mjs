import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { link, lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readGitArchiveCommit } from '../verify-candidate-context.mjs';

const phpClasses = new Map([
  ['CRUDUI\\Generator', '/packages/generator-php/src/Generator.php'],
  ['CRUDUI\\Form', '/packages/generator-php/src/Form.php'],
  ['CRUDUI\\Validator', '/packages/validator-php/src/Public/Validator.php'],
]);

/** Read the embedded commit without buffering the remaining archive into Git. */
export function readSourceArchiveCommit(archiveFile, execute = spawnSync) {
  return readGitArchiveCommit(archiveFile, execute);
}

/** Verify metadata against the deployed Git archive. */
export function sourceArchiveReady(metadata, archiveSha256, archiveCommit) {
  return /^[a-f0-9]{64}$/.test(archiveSha256)
    && /^[a-f0-9]{40}$/.test(archiveCommit)
    && metadata.source?.archiveSha256 === archiveSha256
    && metadata.source?.commit === archiveCommit;
}

/** Resolve after one child process publishes its listening-socket event. */
export function waitForChildReadiness(child, ready) {
  assert.ok(ready && typeof ready.server === 'string', 'Child readiness requires a server');
  assert.ok(['stdout', 'stderr'].includes(ready.stream),
    'Child readiness requires stdout or stderr');
  assert.ok(ready.pattern instanceof RegExp && !ready.pattern.global,
    'Child readiness requires one non-global pattern');
  const output = child[ready.stream];
  assert.ok(output && typeof output.on === 'function',
    'Child readiness stream is unavailable');

  return new Promise((resolve, reject) => {
    let received = '';
    let settled = false;
    function cleanup() {
      output.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    }
    function complete(action, value) {
      if (settled) return;
      settled = true;
      cleanup();
      action(value);
    }
    function onData(chunk) {
      received = (received + chunk.toString()).slice(-16_384);
      ready.pattern.lastIndex = 0;
      if (ready.pattern.test(received)) complete(resolve, ready.server);
    }
    function onError(error) {
      complete(reject, new Error(ready.server + ' failed before readiness', { cause: error }));
    }
    function onExit(code, signal) {
      complete(reject, new Error(ready.server + ' exited before readiness: '
        + (signal ?? code ?? 'unknown')));
    }
    output.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
    if (child.exitCode !== null) onExit(child.exitCode, child.signalCode);
  });
}

/** Request and verify each child server once after all listening events arrive. */
export async function verifyChildServers({ readiness, servers, ports, metadata,
  request = fetch }) {
  assert.deepEqual(servers, ['php', 'php-ext', 'go', 'rust'],
    'Child verification requires the four current servers');
  assert.equal(readiness.length, servers.length,
    'Child verification requires one readiness event per server');
  const readyServers = await Promise.all(readiness);
  assert.deepEqual(readyServers, servers,
    'Child readiness events differ from the current servers');

  let phpSignatures;
  for (const server of servers) {
    const response = await request('http://127.0.0.1:' + ports[server] + '/api/health');
    const value = await response.json();
    if (!serverReady(server, response.ok, value, metadata, phpSignatures)) {
      throw new Error(server + ' failed startup verification');
    }
    if (server === 'php') phpSignatures = value.generator.signatures;
  }
}

/** Return the declared readiness output for this container invocation. */
export function readinessOutput(environment) {
  if (environment.FORM_COMPARISON_READINESS === 'service') {
    assert.equal(environment.FORM_COMPARISON_READY_FILE, undefined,
      'Service readiness must not declare a candidate readiness file');
    return null;
  }
  assert.equal(environment.FORM_COMPARISON_READINESS, 'file',
    'FORM_COMPARISON_READINESS must be service or file');
  assert.ok(typeof environment.FORM_COMPARISON_READY_FILE === 'string'
    && path.isAbsolute(environment.FORM_COMPARISON_READY_FILE),
  'Candidate readiness path must be absolute');
  return environment.FORM_COMPARISON_READY_FILE;
}

/** Publish one complete readiness record without replacing an existing path. */
export async function publishCandidateReadiness(file, value) {
  assert.ok(typeof file === 'string' && path.isAbsolute(file),
    'Candidate readiness path must be absolute');
  const parent = path.dirname(file);
  assert.equal(await realpath(parent), parent,
    'Candidate readiness path must not contain symbolic links');
  const parentState = await lstat(parent);
  assert.equal(parentState.isDirectory(), true,
    'Candidate readiness parent must be a directory');
  try {
    await lstat(file);
    throw new Error('Candidate readiness path already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const temporary = path.join(parent, '.' + path.basename(file)
    + '.' + process.pid + '.tmp');
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value) + '\n');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, file);
    const state = await lstat(file);
    assert.equal(state.isSymbolicLink(), false,
      'Candidate readiness file must not be a symbolic link');
    assert.equal(state.isFile(), true, 'Candidate readiness path must be a regular file');
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

function phpReady(server, value, metadata, expectedSignatures) {
  const native = server === 'php-ext';
  const generator = value.generator;
  if (!generator || generator.runtime !== server || generator.commit !== metadata.source?.commit || generator.nativeCRUDUI !== native) return false;
  if (generator.archiveSha256 !== metadata.source?.archiveSha256) return false;
  if (generator.moduleSha256 !== (native ? metadata.cruduiModuleSha256 : null)) return false;
  if (generator.composerAutoload !== !native) return false;
  if (value.nativeJson !== native || !generator.classes || Array.isArray(generator.classes)) return false;
  if (!generator.signatures || Array.isArray(generator.signatures)) return false;
  const classes = Object.keys(generator.classes);
  if (classes.length !== phpClasses.size || classes.some(name => !phpClasses.has(name))) return false;
  const signatures = Object.keys(generator.signatures);
  if (signatures.length !== phpClasses.size || signatures.some(name => !phpClasses.has(name))) return false;
  if (native && expectedSignatures === undefined) return false;
  if (expectedSignatures !== undefined && JSON.stringify(generator.signatures) !== JSON.stringify(expectedSignatures)) return false;
  return classes.every(name => {
    const source = generator.classes[name];
    if (!source || source.internal !== native || source.extension !== (native ? 'crudui' : null)) return false;
    return native ? source.file === null : typeof source.file === 'string' && source.file.startsWith('/') && source.file.endsWith(phpClasses.get(name));
  });
}

/** Verify that a child server reports the source and implementation it must run. */
export function serverReady(server, responseOk, value, metadata, expectedPhpSignatures) {
  if (!responseOk || !value || value.status !== 'ok' || value.server !== server) return false;
  if (server === 'php' || server === 'php-ext') return phpReady(server, value, metadata, expectedPhpSignatures);
  return value.commit === metadata.source?.commit;
}
