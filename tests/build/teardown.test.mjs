// A teardown (scripts/test-progress/teardown.mjs) is a long operation: it has no hook timeout, so
// a close that takes longer than the timeout of a test case still ends the file by its result.
// Each case runs a test file through the test runner with a one-second timeout per test, and a
// teardown that resolves or fails after 1.5 seconds.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEARDOWN = pathToFileURL(path.join(ROOT, 'scripts/test-progress/teardown.mjs')).href;

/** Run one test file with a one-second timeout per test; resolve with its exit status and output. */
async function runFile(t, source) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-teardown-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'teardown.test.mjs');
  await writeFile(file, source);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'node', '--timeout', '1', '--', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', status => resolve({ status, output }));
  });
}

const slowClose = "() => new Promise(resolve => setTimeout(resolve, 1500))";

test('a teardown of a file that closes after the test timeout passes', async t => {
  const run = await runFile(t, `import test from 'node:test';\nimport { teardown } from ${JSON.stringify(TEARDOWN)};\n`
    + `teardown('slow close', ${slowClose}, { heartbeatMs: 500 });\ntest('uses the resource', () => {});\n`);
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /\[teardown\] slow close: started/);
  assert.match(run.output, /\[teardown\] slow close: still running \(\d+\.\ds\)/);
  assert.match(run.output, /\[teardown\] slow close: finished in \d+\.\ds/);
});

test('a teardown of a test that closes after the test timeout passes', async t => {
  const run = await runFile(t, `import test from 'node:test';\nimport { teardown } from ${JSON.stringify(TEARDOWN)};\n`
    + `test('uses the resource', t => { teardown('slow close', ${slowClose}, { context: t }); });\n`);
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /\[teardown\] slow close: finished in \d+\.\ds/);
});

test('a teardown that fails fails its file with its error', async t => {
  const run = await runFile(t, `import test from 'node:test';\nimport { teardown } from ${JSON.stringify(TEARDOWN)};\n`
    + "teardown('broken close', () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('close refused')), 1500)));\n"
    + "test('uses the resource', () => {});\n");
  assert.notEqual(run.status, 0, run.output);
  assert.match(run.output, /\[teardown\] broken close: failed after \d+\.\ds: close refused/);
});
