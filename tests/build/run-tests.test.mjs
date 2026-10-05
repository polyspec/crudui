import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cargoEvents, goEvents, parseArguments, phpunitEvents, toolCommand } from '../../scripts/run-tests.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Run a command without blocking the event loop, so this case's own timeout can stop it. */
function runAsync(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', status => resolve({ status, stdout, stderr }));
  });
}

function recorder() {
  const lines = [];
  let clock = 0;
  const progress = createProgress({ write: text => lines.push(text.replace(/^\[\s*[\d.]+s\] /, '').trim()), now: () => clock, heartbeatMs: 60_000 });
  return { lines, progress, tick: ms => { clock += ms; } };
}

test('arguments select a tool, a per-test timeout and a directory', () => {
  assert.deepEqual(parseArguments(['node', '--timeout', '5', '--', 'a.test.mjs']), { tool: 'node', timeoutSeconds: 5, cwd: ROOT, args: ['a.test.mjs'] });
  assert.equal(parseArguments(['go', '--cwd', 'packages/generator-go']).cwd, path.join(ROOT, 'packages/generator-go'));
  assert.deepEqual(parseArguments(['vitest', '--cwd', 'packages/generator-core', 'src/list.test.ts']).args, ['src/list.test.ts']);
  assert.deepEqual(parseArguments(['node', '--test-name-pattern', 'x']).args, ['--test-name-pattern', 'x']);
  for (const argv of [[], ['jest'], ['node', '--timeout', '0'], ['node', '--timeout', '1.5'], ['node', '--cwd']]) assert.throws(() => parseArguments(argv), /Usage/);
  assert.ok(toolCommand(parseArguments(['node', '--timeout', '5'])).args.includes('--test-timeout=5000'));
  assert.ok(toolCommand(parseArguments(['vitest', '--timeout', '5'])).args.includes('--testTimeout=5000'));
  const cargo = toolCommand(parseArguments(['cargo', '--', '--test', 'a', '--', '--exact']));
  // cargo runs through the shared Rust command entry point, which selects the toolchain.
  assert.deepEqual(cargo.args.slice(0, 2), [path.join(ROOT, 'scripts/run-rust-command.mjs'), 'test']);
  assert.deepEqual(cargo.args.slice(-4), ['a', '--', '--test-threads=1', '--exact']);
});

test('go test events become start, pass, fail and skip lines with failure output', () => {
  const { lines, progress } = recorder();
  const read = goEvents(progress);
  for (const event of [
    { Action: 'start', Package: 'p' },
    { Action: 'run', Package: 'p', Test: 'TestA' },
    { Action: 'run', Package: 'p', Test: 'TestA/case' },
    { Action: 'output', Package: 'p', Test: 'TestA/case', Output: '    a_test.go:9: wrong value\n' },
    { Action: 'fail', Package: 'p', Test: 'TestA/case', Elapsed: 0.25 },
    { Action: 'fail', Package: 'p', Test: 'TestA', Elapsed: 0.3 },
    { Action: 'run', Package: 'p', Test: 'TestB' },
    { Action: 'skip', Package: 'p', Test: 'TestB' },
    { Action: 'run', Package: 'p', Test: 'TestC' },
    { Action: 'pass', Package: 'p', Test: 'TestC', Elapsed: 0 },
    { Action: 'fail', Package: 'p', Elapsed: 1 },
  ]) read(JSON.stringify(event));
  assert.deepEqual(lines, [
    '▶ p', '▶ p › TestA', '▶ p › TestA › case', '✖ p › TestA › case (0.3s)', 'a_test.go:9: wrong value', '✖ p › TestA (0.3s)',
    '▶ p › TestB', '○ p › TestB skipped', '▶ p › TestC', '✔ p › TestC (0.0s)', '✖ p (1.0s)',
  ]);
  assert.deepEqual(progress.counts, { passed: 1, failed: 2, skipped: 1, timedOut: 0 });
});

test('serial libtest output starts a test before its result arrives', () => {
  const { lines, progress, tick } = recorder();
  const events = cargoEvents(progress);
  events.stderr('     Running tests/a.rs (target/debug/deps/a-1)');
  events.stdout('\nrunning 2 tests\ntest first ... ');
  assert.equal(lines.at(-1), '▶ tests/a.rs › first');
  tick(1500);
  events.stdout('ok\ntest second ... ');
  events.stdout('FAILED\n\nfailures:\n\n---- second stdout ----\nboom\ntest result: FAILED. 1 passed; 1 failed\n');
  assert.deepEqual(lines, [
    'Running tests/a.rs (target/debug/deps/a-1)', '▶ tests/a.rs › first', '✔ tests/a.rs › first (1.5s)',
    '▶ tests/a.rs › second', '✖ tests/a.rs › second (0.0s)', '---- second stdout ----', 'boom',
  ]);
});

test('PHPUnit TeamCity messages name each test by class and method and other lines are printed', () => {
  const { lines, progress } = recorder();
  const read = phpunitEvents(progress);
  for (const line of [
    'PHPUnit 12.5.0 by Sebastian Bergmann and contributors.',
    '',
    "##teamcity[testSuiteStarted name='Suite' flowId='1']",
    "##teamcity[testSuiteStarted name='A\\ATest' locationHint='php_qn:///t/ATest.php::\\A\\ATest' flowId='1']",
    "##teamcity[testSuiteStarted name='testA' locationHint='php_qn:///t/ATest.php::\\A\\ATest::testA' flowId='1']",
    "##teamcity[testStarted name='testA with data set \"x\"' locationHint='php_qn:///t/ATest.php::\\\\A\\\\ATest::testA with data set \"x\"' flowId='1']",
    "##teamcity[testFailed name='testA with data set \"x\"' message='Failed asserting |'1|'' details='at ATest.php:3|n' flowId='1']",
    "##teamcity[testFinished name='testA with data set \"x\"' duration='12' flowId='1']",
    "##teamcity[testSuiteFinished name='testA' flowId='1']",
    "##teamcity[testStarted name='testB' locationHint='php_qn:///t/ATest.php::\\\\A\\\\ATest::testB' flowId='1']",
    "##teamcity[testFinished name='testB' duration='0' flowId='1']",
    "##teamcity[testSuiteFinished name='A\\ATest' flowId='1']",
    "##teamcity[testSuiteFinished name='Suite' flowId='1']",
    'Test file "/missing.php" not found',
  ]) read(line);
  // The class and the data provider method are suites, not tests: two tests ran.
  assert.deepEqual(progress.counts, { passed: 1, failed: 1, skipped: 0, timedOut: 0 });
  assert.deepEqual(lines, [
    'PHPUnit 12.5.0 by Sebastian Bergmann and contributors.', '▶ Suite', '▶ ATest::testA with data set "x"', '✖ ATest::testA with data set "x" (0.0s)', "Failed asserting '1'", 'at ATest.php:3',
    '▶ ATest::testB', '✔ ATest::testB (0.0s)', '✔ Suite (0.0s)', 'Test file "/missing.php" not found',
  ]);
});

test('a test that outlives its timeout stops the tool and fails the run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-run-tests-'));
  try {
    const file = path.join(directory, 'hang.test.mjs');
    // The hanging test never settles and keeps its process alive, so the run ends only when the
    // runner stops the test at its timeout; this case's own timeout fails a run that never ends.
    await writeFile(file, "import test from 'node:test';\ntest('hangs', () => { setInterval(() => {}, 1000); return new Promise(() => {}); });\ntest('passes', () => {});\n");
    const run = await runAsync([path.join(ROOT, 'scripts/run-tests.mjs'), 'node', '--timeout', '1', '--', file]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /▶ .*hang\.test\.mjs › hangs/);
    assert.match(run.stdout, /✖ .*hang\.test\.mjs › hangs \(1\.0s\)/);
    assert.match(run.stdout, /✔ .*hang\.test\.mjs › passes/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a tool that fails before any test runs fails the summary line too', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-run-tests-'));
  try {
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'Cargo.toml'), '[package]\nname = "broken"\nversion = "0.0.0"\nedition = "2021"\n');
    await writeFile(path.join(directory, 'src/lib.rs'), '#[test]\nfn broken() { undefined(); }\n');
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'cargo', '--cwd', directory, '--', '--offline'], { encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: path.join(directory, 'target') } });
    assert.notEqual(run.status, 0);
    assert.doesNotMatch(run.stdout, /✔ cargo /);
    assert.match(run.stdout, /✖ cargo .*: 0 passed, 0 failed, 0 timed out, 0 skipped, the tool exited with [1-9]\d*/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a node run that ends with a failure after its tests passed says so on a failure line', async () => {
  // The reporter prints its passing summary from inside node --test; when node --test itself then
  // ends on a signal or a nonzero code, the run fails and a line names why.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-run-tests-'));
  try {
    const file = path.join(directory, 'killed.test.mjs');
    await writeFile(file, "import test from 'node:test';\ntest('passes', () => {});\ntest.after(() => process.kill(process.ppid, 'SIGKILL'));\n");
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'node', '--timeout', '10', '--', file], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✖ node .*killed\.test\.mjs: the tool ended on SIGKILL/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a node hook that runs out of time fails its file with the file and the elapsed time', async () => {
  // node --test reports a timed-out hook of a file only as a failure of the file's process,
  // without a completion of that test; the file itself still completes as passed.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-run-tests-'));
  try {
    const file = path.join(directory, 'hook.test.mjs');
    // The hook never settles, so the file ends only at the hook's own timeout.
    await writeFile(file, "import test from 'node:test';\ntest('passes', () => {});\ntest.after(() => { setInterval(() => {}, 1000); return new Promise(() => {}); }, { timeout: 300 });\n");
    const run = await runAsync([path.join(ROOT, 'scripts/run-tests.mjs'), 'node', '--timeout', '10', '--', file]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✔ .*hook\.test\.mjs › passes/);
    assert.match(run.stdout, /✖ .*hook\.test\.mjs › hook \(\d+\.\ds\)\n\s+test timed out after 300ms/);
    assert.match(run.stdout, /✖ .*hook\.test\.mjs \(\d+\.\ds\)\n/);
    assert.match(run.stdout, /✖ node --test: 1 passed, 1 failed, 0 timed out, 0 skipped, 1 group failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a vitest hook that runs out of time is printed with its file, suite, cause and elapsed time', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-run-tests-'));
  try {
    // The hooks never settle, so each file ends only at its hook's own timeout.
    await writeFile(path.join(directory, 'file-hook.test.mjs'), "import { afterAll, test } from 'vitest';\ntest('passes', () => {});\nafterAll(() => new Promise(() => {}), 300);\n");
    await writeFile(path.join(directory, 'suite-hook.test.mjs'), "import { afterAll, describe, test } from 'vitest';\ndescribe('suite', () => {\n  afterAll(() => new Promise(() => {}), 300);\n  test('passes', () => {});\n});\n");
    const run = await runAsync([path.join(ROOT, 'scripts/run-tests.mjs'), 'vitest', '--timeout', '10', '--cwd', directory]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✖ .*file-hook\.test\.mjs \(\d+\.\ds\)\n\s+Hook timed out in 300ms/);
    assert.match(run.stdout, /✖ .*suite-hook\.test\.mjs › suite \(\d+\.\ds\)\n\s+Hook timed out in 300ms/);
    assert.match(run.stdout, /✖ vitest: 2 passed, 0 failed, 0 timed out, 0 skipped, 3 groups failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
