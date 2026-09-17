import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

import { createProgress } from './test-progress/progress.mjs';

const forbiddenArguments = new Set(['--no-sandbox', '--disable-setuid-sandbox']);

function requireExecutableFile(metadata, filename) {
  assert.equal(metadata.isSymbolicLink(), false, `${filename} must not be a symbolic link`);
  assert.equal(metadata.isFile(), true, `${filename} must be a regular file`);
  assert.notEqual(metadata.mode & 0o111, 0, `${filename} must be executable`);
}

async function requireCanonicalDirectory(directory, inspect) {
  const { root } = path.parse(directory);
  let current = root;
  for (const part of directory.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const metadata = await inspect(current);
    assert.equal(metadata.isSymbolicLink(), false, `${current} must not be a symbolic link`);
    assert.equal(metadata.isDirectory(), true, `${current} must be a directory`);
  }
}

/** Verify the Linux CI Chrome executable and active browser sandbox. */
export async function checkCiBrowser({
  executablePath = process.env.PUPPETEER_EXECUTABLE_PATH,
  inspect = lstat,
  launch = options => puppeteer.launch(options),
} = {}) {
  assert.equal(typeof executablePath, 'string', 'PUPPETEER_EXECUTABLE_PATH is required');
  assert.equal(path.isAbsolute(executablePath), true,
    'PUPPETEER_EXECUTABLE_PATH must be absolute');
  assert.equal(path.resolve(executablePath), executablePath,
    'PUPPETEER_EXECUTABLE_PATH must be canonical');

  await requireCanonicalDirectory(path.dirname(executablePath), inspect);
  const executable = await inspect(executablePath);
  requireExecutableFile(executable, executablePath);

  const browser = await launch({ headless: true, executablePath });
  try {
    const spawnArguments = browser.process()?.spawnargs;
    assert.ok(Array.isArray(spawnArguments), 'Chrome process arguments are required');
    const disabledSandbox = spawnArguments.find(argument => forbiddenArguments.has(argument));
    assert.equal(disabledSandbox, undefined, `Chrome received ${disabledSandbox}`);

    const page = await browser.newPage();
    try {
      await page.goto('chrome://sandbox');
      await page.waitForFunction(() => (
        document.querySelector('#evaluation')?.textContent?.trim().length > 0
      ));
      const status = await page.evaluate(() => ({
        evaluation: document.querySelector('#evaluation')?.textContent?.trim(),
        rows: Object.fromEntries([...document.querySelectorAll('#sandbox-status tr')].map(row => {
          const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent?.trim());
          return [cells[0], cells[1]];
        })),
      }));
      assert.equal(status.evaluation, 'You are adequately sandboxed.');
      assert.match(status.rows['Layer 1 Sandbox'] ?? '', /^(?:Namespace|SUID)$/);
      assert.equal(status.rows['PID namespaces'], 'Yes');
      assert.equal(status.rows['Network namespaces'], 'Yes');
      assert.equal(status.rows['Seccomp-BPF sandbox'], 'Yes');
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  return { executablePath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lines = createProgress({ write: text => process.stdout.write(text), timeoutMs: 60_000, onTimeout: () => process.exit(1) });
  const id = `sandboxed Chrome at ${process.env.PUPPETEER_EXECUTABLE_PATH}`;
  lines.start(id);
  try {
    await checkCiBrowser();
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.stack ?? error.message);
    process.exitCode = 1;
  }
  lines.close('CI browser');
}
