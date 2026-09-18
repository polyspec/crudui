import assert from 'node:assert/strict';

import { phpClassNames, phpClassProvenanceFailure } from './php-provenance.mjs';
import { formServers } from './runtime-paths.mjs';
import { serverPorts, treeDirectory } from './server-layout.mjs';
import { sameSourceIdentity } from './source-identity.mjs';
import { formatDuration, killProcessTree, stepTerminationGraceMs } from './step-runner.mjs';

/** A started process announces readiness within this limit (the record servers measured 0.07 to 0.44 s). */
export const processStartLimitMs = 30_000;

/** One health request answers within this limit (each answers in milliseconds). */
export const healthRequestLimitMs = 10_000;

/**
 * Stop one child server and every descendant: SIGTERM, then SIGKILL after the grace period, so a
 * child that ignores SIGTERM cannot hold the supervisor.
 */
export function stopChild(child, graceMs = stepTerminationGraceMs) {
  return killProcessTree(child, graceMs);
}

/**
 * Resolve after one child process publishes its listening-socket event, and fail when it does not
 * within its limit.
 */
export function waitForChildReadiness(child, ready, limitMs = processStartLimitMs) {
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
    const timer = setTimeout(() => complete(reject, new Error(
      `${ready.server} published no readiness within ${formatDuration(limitMs)}`)), limitMs);
    function cleanup() {
      clearTimeout(timer);
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
 * the PHP extension, the digest of the module it loaded. Each request, its body included, holds
 * its own limit.
 */
export async function verifyChildServers({ expected, request = fetch, limitMs = healthRequestLimitMs }) {
  let phpSignatures;
  for (const server of formServers) {
    let response;
    let value;
    try {
      const signal = AbortSignal.timeout(limitMs);
      response = await request('http://127.0.0.1:' + serverPorts[server] + '/api/health', { signal });
      value = await response.json();
    } catch (error) {
      throw new Error(`${server} health request failed within ${formatDuration(limitMs)}: ${error.message}`,
        { cause: error });
    }
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
