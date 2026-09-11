import assert from 'node:assert/strict';
import test from 'node:test';

import { checkCiBrowser } from '../../scripts/check-ci-browser.mjs';

const executablePath = '/opt/google/chrome/chrome';
const sandboxPath = '/opt/google/chrome/chrome-sandbox';
const adequateSandbox = {
  evaluation: 'You are adequately sandboxed.',
  rows: {
    'Layer 1 Sandbox': 'Namespace',
    'PID namespaces': 'Yes',
    'Network namespaces': 'Yes',
    'Seccomp-BPF sandbox': 'Yes',
  },
};

function metadata({
  mode = 0o100755, uid = 501, symbolicLink = false, type = 'file',
} = {}) {
  return {
    mode,
    uid,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => symbolicLink,
  };
}

const inspectRegularChrome = async filename => {
  if (filename === executablePath) return metadata();
  return metadata({ type: 'directory' });
};

function browser({
  spawnargs = [executablePath, '--headless'], sandbox = adequateSandbox,
} = {}) {
  const events = [];
  return {
    events,
    process: () => ({ spawnargs }),
    async newPage() {
      events.push('new-page');
      return {
        async goto(url) { events.push(['goto', url]); },
        async waitForFunction() { events.push('wait-for-status'); },
        async evaluate() { events.push('read-status'); return sandbox; },
        async close() { events.push('close-page'); },
      };
    },
    async close() { events.push('close-browser'); },
  };
}

test('CI browser preflight verifies regular executable files and starts Chrome', async () => {
  const inspected = [];
  const launched = [];
  const instance = browser();
  const result = await checkCiBrowser({
    executablePath,
    async inspect(filename) {
      inspected.push(filename);
      return inspectRegularChrome(filename);
    },
    async launch(options) {
      launched.push(options);
      return instance;
    },
  });

  assert.deepEqual(result, { executablePath });
  assert.deepEqual(inspected, [
    '/opt', '/opt/google', '/opt/google/chrome', executablePath,
  ]);
  assert.deepEqual(launched, [{ headless: true, executablePath }]);
  assert.deepEqual(instance.events, [
    'new-page',
    ['goto', 'chrome://sandbox'],
    'wait-for-status',
    'read-status',
    'close-page',
    'close-browser',
  ]);
});

test('CI browser preflight accepts namespace sandbox without set-user-ID helper', async () => {
  await checkCiBrowser({
    executablePath,
    inspect: async filename => {
      assert.notEqual(filename, sandboxPath);
      return inspectRegularChrome(filename);
    },
    launch: async () => browser(),
  });
});

test('CI browser preflight rejects a symbolic-link executable', async () => {
  await assert.rejects(
    checkCiBrowser({
      executablePath,
      inspect: async filename => filename === executablePath
        ? metadata({ symbolicLink: true })
        : inspectRegularChrome(filename),
      launch: async () => browser(),
    }),
    /must not be a symbolic link/,
  );
});

test('CI browser preflight rejects an inadequate Chrome sandbox status', async () => {
  await assert.rejects(
    checkCiBrowser({
      executablePath,
      inspect: inspectRegularChrome,
      launch: async () => browser({ sandbox: {
        evaluation: 'You are NOT adequately sandboxed.',
        rows: { ...adequateSandbox.rows, 'Layer 1 Sandbox': 'None' },
      } }),
    }),
    /You are adequately sandboxed/,
  );
});

test('CI browser preflight rejects sandbox-disabling process arguments', async () => {
  await assert.rejects(
    checkCiBrowser({
      executablePath,
      inspect: inspectRegularChrome,
      launch: async () => browser({ spawnargs: [executablePath, '--no-sandbox'] }),
    }),
    /Chrome received --no-sandbox/,
  );
});
