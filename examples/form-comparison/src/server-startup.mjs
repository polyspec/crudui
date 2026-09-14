import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { link, lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readGitArchiveCommit } from '../verify-candidate-context.mjs';
import { phpClassNames, phpClassProvenanceFailure } from './php-provenance.mjs';
import { sourceDirectory } from './server-layout.mjs';
import { formServers } from './runtime-paths.mjs';

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
  assert.deepEqual(servers, [...formServers],
    'Child verification requires the current servers');
  assert.equal(readiness.length, servers.length,
    'Child verification requires one readiness event per server');
  const readyServers = await Promise.all(readiness);
  assert.deepEqual(readyServers, servers,
    'Child readiness events differ from the current servers');

  let phpSignatures;
  for (const server of servers) {
    const response = await request('http://127.0.0.1:' + ports[server] + '/api/health');
    const value = await response.json();
    const failure = serverFailureField(server, response.ok, value, metadata, phpSignatures);
    if (failure !== null) throw new Error(server + ' failed startup verification: ' + failure);
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

function phpFailureField(server, value, metadata, expectedSignatures) {
  const native = server === 'php-ext';
  const generator = value.generator;
  if (!generator || typeof generator !== 'object' || Array.isArray(generator)) return 'generator';
  if (generator.runtime !== server) return 'generator.runtime';
  if (generator.commit !== metadata.source?.commit) return 'generator.commit';
  if (generator.nativeCRUDUI !== native) return 'generator.nativeCRUDUI';
  if (generator.archiveSha256 !== metadata.source?.archiveSha256) return 'generator.archiveSha256';
  if (generator.moduleSha256 !== (native ? metadata.cruduiModuleSha256 : null)) {
    return 'generator.moduleSha256';
  }
  if (generator.composerAutoload !== !native) return 'generator.composerAutoload';
  if (value.nativeJson !== native) return 'nativeJson';
  const classFailure = phpClassProvenanceFailure(
    generator.classes, native, sourceDirectory);
  if (classFailure === 'generator.classes') return classFailure;
  if (!generator.signatures || typeof generator.signatures !== 'object'
    || Array.isArray(generator.signatures)) return 'generator.signatures';
  const signatures = Object.keys(generator.signatures);
  if (signatures.length !== phpClassNames.length
    || signatures.some(name => !phpClassNames.includes(name))) {
    return 'generator.signatures';
  }
  if (native && expectedSignatures === undefined) return 'generator.signatures';
  if (expectedSignatures !== undefined
    && JSON.stringify(generator.signatures) !== JSON.stringify(expectedSignatures)) {
    return 'generator.signatures';
  }
  return classFailure;
}

function serverFailureField(server, responseOk, value, metadata, expectedPhpSignatures) {
  if (!responseOk) return 'response.ok';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'response.body';
  if (value.status !== 'ok') return 'status';
  if (value.server !== server) return 'server';
  if (server === 'php' || server === 'php-ext') {
    return phpFailureField(server, value, metadata, expectedPhpSignatures);
  }
  return value.commit === metadata.source?.commit ? null : 'commit';
}

/** Verify that a child server reports the source and implementation it must run. */
export function serverReady(server, responseOk, value, metadata, expectedPhpSignatures) {
  return serverFailureField(server, responseOk, value, metadata, expectedPhpSignatures) === null;
}
