import assert from 'node:assert/strict';

import { phpClassNames, phpClassProvenanceFailure } from './php-provenance.mjs';
import { formServers } from './runtime-paths.mjs';
import { serverPorts, treeDirectory } from './server-layout.mjs';
import { sameSourceIdentity } from './source-identity.mjs';

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

/**
 * Request each API server's health once and require the published source identity and, for
 * the PHP extension, the digest of the module it loaded.
 */
export async function verifyChildServers({ expected, request = fetch }) {
  let phpSignatures;
  for (const server of formServers) {
    const response = await request('http://127.0.0.1:' + serverPorts[server] + '/api/health');
    const value = await response.json();
    const failure = serverFailureField(server, response.ok, value, expected, phpSignatures);
    if (failure !== null) throw new Error(server + ' failed startup verification: ' + failure);
    if (server === 'php') phpSignatures = value.generator.signatures;
  }
}

function sourceFailure(value, expected, field) {
  const keys = value && typeof value === 'object' ? Object.keys(value) : [];
  return JSON.stringify(keys) === JSON.stringify(['commit', 'changes'])
    && sameSourceIdentity(value, expected.source) ? null : field;
}

function phpFailureField(server, value, expected, expectedSignatures) {
  const native = server === 'php-ext';
  const generator = value.generator;
  if (!generator || typeof generator !== 'object' || Array.isArray(generator)) return 'generator';
  if (generator.runtime !== server) return 'generator.runtime';
  const source = sourceFailure(generator.source, expected, 'generator.source');
  if (source !== null) return source;
  if (generator.nativeCRUDUI !== native) return 'generator.nativeCRUDUI';
  if (generator.moduleSha256 !== (native ? expected.cruduiModuleSha256 : null)) {
    return 'generator.moduleSha256';
  }
  if (generator.composerAutoload !== !native) return 'generator.composerAutoload';
  if (value.nativeJson !== native) return 'nativeJson';
  const classFailure = phpClassProvenanceFailure(generator.classes, native, treeDirectory);
  if (classFailure !== null) return classFailure;
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
  return null;
}

function serverFailureField(server, responseOk, value, expected, expectedPhpSignatures) {
  if (!responseOk) return 'response.ok';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'response.body';
  if (value.status !== 'ok') return 'status';
  if (value.server !== server) return 'server';
  if (server === 'php' || server === 'php-ext') {
    return phpFailureField(server, value, expected, expectedPhpSignatures);
  }
  return sourceFailure(value.source, expected, 'source');
}

/** Verify that one API server reports the source identity and implementation it must run. */
export function serverReady(server, responseOk, value, expected, expectedPhpSignatures) {
  return serverFailureField(server, responseOk, value, expected, expectedPhpSignatures) === null;
}
