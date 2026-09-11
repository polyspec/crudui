import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

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

/** Verify the Linux CI Chrome executable, sandbox helper and browser startup. */
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

  const sandboxPath = path.join(path.dirname(executablePath), 'chrome-sandbox');
  const sandbox = await inspect(sandboxPath);
  requireExecutableFile(sandbox, sandboxPath);
  assert.equal(sandbox.uid, 0, `${sandboxPath} must be owned by root`);
  assert.notEqual(sandbox.mode & 0o4000, 0, `${sandboxPath} must have set-user-ID`);

  const browser = await launch({ headless: true, executablePath });
  try {
    const spawnArguments = browser.process()?.spawnargs;
    assert.ok(Array.isArray(spawnArguments), 'Chrome process arguments are required');
    const disabledSandbox = spawnArguments.find(argument => forbiddenArguments.has(argument));
    assert.equal(disabledSandbox, undefined, `Chrome received ${disabledSandbox}`);

    const page = await browser.newPage();
    try {
      await page.setContent('<!doctype html><title>CRUDUI CI browser</title>');
      assert.equal(await page.title(), 'CRUDUI CI browser');
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  return { executablePath, sandboxPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkCiBrowser();
  console.log(`Sandboxed Chrome passed: ${result.executablePath}`);
}
