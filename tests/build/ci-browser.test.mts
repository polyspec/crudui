import assert from 'node:assert/strict';
import test from 'node:test';

import { checkCiBrowser } from '../../scripts/check-ci-browser.mts';

// The Chrome that puppeteer pins, in the cache of Puppeteer in the checkout of a CI job.
const executablePath = '/work/.tools/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome';
const sandboxPath = '/usr/local/sbin/chrome-devel-sandbox';
/** The status that chrome://sandbox reports: its evaluation line and each row of its table. */
interface SandboxStatus { evaluation: string; rows: Record<string, string> }
/** The part of a file's lstat metadata the preflight reads. */
interface FileMetadata {
  mode: number;
  uid: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}
type BrowserEvent = string | [string, string];

const adequateSandbox: SandboxStatus = {
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
}: { mode?: number; uid?: number; symbolicLink?: boolean; type?: 'file' | 'directory' } = {}): FileMetadata {
  return {
    mode,
    uid,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => symbolicLink,
  };
}

const inspectRegularChrome = async (filename: string): Promise<FileMetadata> => {
  if (filename === executablePath) return metadata();
  return metadata({ type: 'directory' });
};

function browser({
  spawnargs = [executablePath, '--headless'], sandbox = adequateSandbox,
}: { spawnargs?: string[]; sandbox?: SandboxStatus } = {}) {
  const events: BrowserEvent[] = [];
  return {
    events,
    process: () => ({ spawnargs }),
    async newPage() {
      events.push('new-page');
      return {
        async goto(url: string) { events.push(['goto', url]); },
        async waitForFunction() { events.push('wait-for-status'); },
        async evaluate() { events.push('read-status'); return sandbox; },
        async close() { events.push('close-page'); },
      };
    },
    async close() { events.push('close-browser'); },
  };
}

test('CI browser preflight verifies regular executable files and starts Chrome', async () => {
  const inspected: string[] = [];
  const launched: unknown[] = [];
  const instance = browser();
  const result = await checkCiBrowser({
    executablePath,
    async inspect(filename: string) {
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
    '/work', '/work/.tools', '/work/.tools/puppeteer', '/work/.tools/puppeteer/chrome',
    '/work/.tools/puppeteer/chrome/linux-154.0.8037.57', '/work/.tools/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64',
    executablePath,
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
    inspect: async (filename: string) => {
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
      inspect: async (filename: string) => filename === executablePath
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

test('CI browser preflight names each inadequate Chrome sandbox row', async () => {
  const cases: [string, string, RegExp][] = [
    ['Layer 1 Sandbox', 'None', /Chrome sandbox row "Layer 1 Sandbox" is "None"; expected Namespace or SUID/],
    ['PID namespaces', 'No', /Chrome sandbox row "PID namespaces" is "No"; expected "Yes"/],
    ['Network namespaces', 'No', /Chrome sandbox row "Network namespaces" is "No"; expected "Yes"/],
    ['Seccomp-BPF sandbox', 'No', /Chrome sandbox row "Seccomp-BPF sandbox" is "No"; expected "Yes"/],
  ];
  for (const [row, value, message] of cases) {
    await assert.rejects(
      checkCiBrowser({
        executablePath,
        inspect: inspectRegularChrome,
        launch: async () => browser({ sandbox: {
          evaluation: adequateSandbox.evaluation,
          rows: { ...adequateSandbox.rows, [row]: value },
        } }),
      }),
      message,
    );
  }
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
