import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

import { createProgress } from './test-progress/progress.mjs';

const forbiddenArguments = new Set(['--no-sandbox', '--disable-setuid-sandbox']);
const adequateEvaluation = 'You are adequately sandboxed.';
const requiredRows = ['PID namespaces', 'Network namespaces', 'Seccomp-BPF sandbox'];

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
  assert.equal(typeof executablePath, 'string', 'the Chrome executable path is required');
  assert.equal(path.isAbsolute(executablePath), true,
    `the Chrome executable path ${executablePath} must be absolute`);
  assert.equal(path.resolve(executablePath), executablePath,
    `the Chrome executable path ${executablePath} must be canonical`);

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
      assert.equal(status.evaluation, adequateEvaluation,
        `Chrome sandbox evaluation is ${JSON.stringify(status.evaluation)}; `
        + `expected ${JSON.stringify(adequateEvaluation)}`);
      const layer = status.rows['Layer 1 Sandbox'];
      assert.ok(layer === 'Namespace' || layer === 'SUID',
        `Chrome sandbox row "Layer 1 Sandbox" is ${JSON.stringify(layer)}; `
        + 'expected Namespace or SUID');
      for (const row of requiredRows) {
        assert.equal(status.rows[row], 'Yes',
          `Chrome sandbox row "${row}" is ${JSON.stringify(status.rows[row])}; expected "Yes"`);
      }
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
  // The Chrome that puppeteer pins (scripts/install-browsers.mjs), or the one that PUPPETEER_EXECUTABLE_PATH names.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? await puppeteer.executablePath();
  const id = `sandboxed Chrome at ${executablePath}`;
  lines.start(id);
  try {
    await checkCiBrowser({ executablePath });
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.stack ?? error.message);
    process.exitCode = 1;
  }
  lines.close('CI browser');
}
