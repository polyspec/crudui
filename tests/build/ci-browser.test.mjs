import assert from 'node:assert/strict';
import test from 'node:test';

import { checkCiBrowser } from '../../scripts/check-ci-browser.mjs';

const executablePath = '/opt/google/chrome/chrome';
const sandboxPath = '/opt/google/chrome/chrome-sandbox';

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
  if (filename === sandboxPath) return metadata({ mode: 0o104755, uid: 0 });
  if (filename === executablePath) return metadata();
  return metadata({ type: 'directory' });
};

function browser(spawnargs = [executablePath, '--headless']) {
  const events = [];
  return {
    events,
    process: () => ({ spawnargs }),
    async newPage() {
      events.push('new-page');
      return {
        async setContent(html) { events.push(['content', html]); },
        async title() { return 'CRUDUI CI browser'; },
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

  assert.deepEqual(result, { executablePath, sandboxPath });
  assert.deepEqual(inspected, [
    '/opt', '/opt/google', '/opt/google/chrome', executablePath, sandboxPath,
  ]);
  assert.deepEqual(launched, [{ headless: true, executablePath }]);
  assert.deepEqual(instance.events, [
    'new-page',
    ['content', '<!doctype html><title>CRUDUI CI browser</title>'],
    'close-page',
    'close-browser',
  ]);
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

test('CI browser preflight rejects a sandbox without root set-user-ID ownership', async () => {
  await assert.rejects(
    checkCiBrowser({
      executablePath,
      inspect: async filename => filename === sandboxPath
        ? metadata({ mode: 0o100755, uid: 501 })
        : inspectRegularChrome(filename),
      launch: async () => browser(),
    }),
    /must be owned by root/,
  );
});

test('CI browser preflight rejects sandbox-disabling process arguments', async () => {
  await assert.rejects(
    checkCiBrowser({
      executablePath,
      inspect: inspectRegularChrome,
      launch: async () => browser([executablePath, '--no-sandbox']),
    }),
    /Chrome received --no-sandbox/,
  );
});
