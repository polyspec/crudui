// A script that runs other commands (a build, a documentation tool, a declared test command, a
// benchmark driver) runs each of them to its end through scripts/run-command.mjs: the command has
// no time limit, its exit ends it, its status decides the result, and the script prints it with
// its elapsed time. Each script under test runs in a copy of the files it reads, with stand-in
// programs: `slow` writes a line, waits 1.2 seconds and ends with status 0, and `orphan` leaves a
// child that ignores SIGTERM and holds the output open, then ends with status 0.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHARED = ['scripts/run-command.mjs', 'scripts/checkout-npm.mjs', 'scripts/test-progress'];

/** A sandbox with the listed repository files and a `bin` directory for stand-in programs. */
function sandbox(t, files) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'crudui-run-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [...files, ...SHARED]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(root, file), { recursive: true });
  }
  mkdirSync(path.join(root, 'bin'));
  const program = (name, source) => {
    const file = path.join(root, 'bin', name);
    writeFileSync(file, `#!${process.execPath}\n${source}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  return { root, program };
}

/** A program that writes `<name>: running`, waits 1.2 seconds, writes `output` and ends with 0. */
const slow = (name, output = '') => `process.stdout.write(${JSON.stringify(`${name}: running\n`)});\n`
  + `setTimeout(() => process.stdout.write(${JSON.stringify(output)}), 1200);\n`;

/**
 * A program that starts a child which ignores SIGTERM, keeps the program's standard output and
 * waits forever, records the child's process id, and ends with status 0.
 */
function orphan(pidFile) {
  return "const { spawn } = require('node:child_process');\n"
    + `const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'inherit', 'inherit'] });\n`
    + `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));\n`
    + 'child.unref();\n';
}

/**
 * Run a script and resolve when its output closes: the script and every process that holds its
 * output have ended. A child the script left alive keeps the output open, so this run never ends
 * and the test's own timeout fails it.
 */
function runScript(script, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', status;
    const ended = Promise.all([
      new Promise(done => child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; }).once('close', done)),
      new Promise(done => child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; }).once('close', done)),
      new Promise(done => child.once('exit', code => { status = code; done(); })),
    ]);
    child.once('error', reject);
    ended.then(() => resolve({ status, output }), reject);
  });
}

/** A child left alive by a failed case is stopped after the test, so it never outlives the run. */
function stopRecorded(t, pidFile) {
  t.after(() => {
    if (!existsSync(pidFile)) return;
    try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
}

test('run-contract-tests runs a declared command to its end', async t => {
  const box = sandbox(t, ['scripts/run-contract-tests.mjs']);
  const command = box.program('declared', slow('declared'));
  mkdirSync(path.join(box.root, 'contracts'));
  writeFileSync(path.join(box.root, 'contracts/features.json'), JSON.stringify({
    features: [{ id: 'slow', verification: [{ id: 'check', command }] }],
  }));
  const result = await runScript(path.join(box.root, 'scripts/run-contract-tests.mjs'), [], { cwd: box.root, env: process.env });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /declared: running/);
  assert.match(result.output, /✔ slow\/check: .*declared \(\d+\.\ds\)/);
});

test('run-contract-tests fails when the selection declares no command', async t => {
  const box = sandbox(t, ['scripts/run-contract-tests.mjs']);
  mkdirSync(path.join(box.root, 'contracts'));
  writeFileSync(path.join(box.root, 'contracts/features.json'), JSON.stringify({ features: [{ id: 'empty', verification: [] }] }));
  const result = await runScript(path.join(box.root, 'scripts/run-contract-tests.mjs'), [], { cwd: box.root, env: process.env });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /✖ manifest:test: ran no command: the selected features declare no verification command/);
});

test('require-current-build runs the build to its end and stops what it left behind', async t => {
  const box = sandbox(t, ['scripts/require-current-build.mjs', 'package.json', 'package-lock.json']);
  const pidFile = path.join(box.root, 'orphan.pid');
  stopRecorded(t, pidFile);
  box.program('npm', `${slow('npm')}${orphan(pidFile)}`);
  const result = await runScript(path.join(box.root, 'scripts/require-current-build.mjs'), [], {
    cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin') },
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /npm: running/);
  assert.match(result.output, /build: npm run build finished in \d+\.\ds/);
  assert.ok(existsSync(pidFile), 'the build started its child');
});

test('gen-api-docs runs each documentation tool to its end with its elapsed time', async t => {
  const box = sandbox(t, ['scripts/gen-api-docs.mjs', 'scripts/run-rust-command.mjs', 'scripts/tool-resolution.mjs']);
  // A Go tool that lists one package and documents it, each after 1.2 seconds.
  box.program('go', "process.stdout.write('');\n"
    + "setTimeout(() => process.stdout.write(process.argv[2] === 'list' ? 'example.com/one\\n' : 'package one\\n'), 1200);\n");
  for (const name of ['validator-go', 'generator-go']) mkdirSync(path.join(box.root, 'packages', name), { recursive: true });
  const result = await runScript(path.join(box.root, 'scripts/gen-api-docs.mjs'), ['go'], {
    cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin'), GO: 'go' },
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /✔ go list .* \(\d+\.\ds\)/);
  assert.match(result.output, /✔ go doc -all example\.com\/one \(\d+\.\ds\)/);
});

test('run.js runs a benchmark driver to its end', async t => {
  // The JavaScript driver starts as `node` from PATH; here it reports one row after 1.2 seconds.
  const box = sandbox(t, ['tools/bench/run.js', 'tools/bench/arguments.js', 'tools/bench/fixtures']);
  const row = JSON.stringify({ spec: 'contact', lang: 'js', valid: true, error: null, field: null, opsSec: 1, avgUs: 1, ms: 1 });
  box.program('node', slow('driver', `${row}\n`));
  const result = await runScript(path.join(box.root, 'tools/bench/run.js'), ['--only', 'js', '--json'], {
    cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin') },
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /\[bench\] js finished after \d+\.\ds/);
  assert.match(result.output, /"spec":"contact"/);
});

// The JavaScript driver of these cases is a `node` from PATH that reports one row, or prints its
// version or fails on `--version`.
function benchNode(box, version) {
  const row = JSON.stringify({ spec: 'contact', lang: 'js', valid: true, error: null, field: null, opsSec: 1, avgUs: 1, ms: 1 });
  box.program('node', "if (process.argv[2] === '--version') {\n"
    + (version ? `  process.stdout.write(${JSON.stringify(`${version}\n`)});\n` : "  process.stderr.write('node: broken installation\\n'); process.exitCode = 3;\n")
    + `} else process.stdout.write(${JSON.stringify(`${row}\n`)});\n`);
}

test('run.js records the version of each tool of the backends it ran', async t => {
  const box = sandbox(t, ['tools/bench/run.js', 'tools/bench/arguments.js', 'tools/bench/fixtures']);
  benchNode(box, 'v99.1.0');
  const result = await runScript(path.join(box.root, 'tools/bench/run.js'), ['--only', 'js'], {
    cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin') },
  });
  assert.equal(result.status, 0, result.output);
  const report = readFileSync(path.join(box.root, 'tools/bench/results.md'), 'utf8');
  assert.match(report, /^- node: v99\.1\.0$/m);
  assert.doesNotMatch(report, /^- (?:php|go|rust\/cargo):/m, 'a tool of a backend that did not run is not recorded');
});

test('run.js fails when a version command fails, with its error', async t => {
  const box = sandbox(t, ['tools/bench/run.js', 'tools/bench/arguments.js', 'tools/bench/fixtures']);
  benchNode(box);
  const result = await runScript(path.join(box.root, 'tools/bench/run.js'), ['--only', 'js'], {
    cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin') },
  });
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /node --version failed with status 3/);
  assert.match(result.output, /node: broken installation/);
  assert.equal(existsSync(path.join(box.root, 'tools/bench/results.md')), false, 'no report with a missing version');
});

test('build-drivers.mjs streams a driver build to its end and stops what it left behind', async t => {
  // GO names the Go command of the build. The Rust build finds no toolchain in the sandbox and fails.
  const box = sandbox(t, ['tools/bench/build-drivers.mjs', 'tools/bench/drivers.mjs', 'scripts/run-rust-command.mjs', 'scripts/tool-resolution.mjs']);
  const pidFile = path.join(box.root, 'orphan.pid');
  stopRecorded(t, pidFile);
  mkdirSync(path.join(box.root, 'tools/bench/go'));
  mkdirSync(path.join(box.root, 'tools/bench/rust'));
  const go = box.program('go', `${slow('go build')}${orphan(pidFile)}`);
  const result = await runScript(path.join(box.root, 'tools/bench/build-drivers.mjs'), [], {
    cwd: box.root, env: { ...process.env, GO: go, CARGO_HOME: path.join(box.root, 'cargo') },
  });
  assert.match(result.output, /go build: running/);
  assert.match(result.output, /✔ build: go benchmark driver \(\d+\.\ds\)/);
  assert.match(result.output, /✖ build: rust benchmark driver \(\d+\.\ds\)/);
  assert.notEqual(result.status, 0, result.output);
  assert.ok(existsSync(pidFile), 'the build started its child');
});
