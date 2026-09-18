// A script that runs other commands gives each of them a time limit. The command starts in its own
// process group, and at the limit the whole group stops: the wrapper the script started (npm,
// go run, cargo run, /bin/sh) and every process under it, including one that ignores SIGTERM.
// CRUDUI_COMMAND_LIMIT_SECONDS replaces each script's own limit, which lets these checks use a
// one-second limit. Each script under test runs in a copy of the files it reads, with a command
// that starts a stubborn child and never ends.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIMIT_SECONDS = 1;
// The limit, the grace before SIGKILL and a margin for a loaded machine.
const STOPPED_WITHIN_MS = 8_000;
// A script that ignored its limit is killed by this test at this deadline and fails it.
const DEADLINE_MS = 20_000;

/** A sandbox with the listed repository files and a `hang` program that never ends. */
function sandbox(files) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'crudui-bounded-'));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(root, file), { recursive: true });
  }
  mkdirSync(path.join(root, 'bin'));
  const pidFile = path.join(root, 'grandchild.pid');
  // The command starts a child that ignores SIGTERM, records its process id and waits forever.
  const hang = `#!${process.execPath}\n`
    + "const { spawn } = require('node:child_process');\n"
    + `const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });\n`
    + `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));\n`
    + 'setInterval(() => {}, 1000);\n';
  const program = name => {
    writeFileSync(path.join(root, 'bin', name), hang);
    chmodSync(path.join(root, 'bin', name), 0o755);
    return path.join(root, 'bin', name);
  };
  return { root, pidFile, program };
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** Wait until the recorded grandchild is gone; a killed process is reaped shortly after. */
async function assertGone(pidFile) {
  const pid = Number(readFileSync(pidFile, 'utf8'));
  for (let attempt = 0; attempt < 40 && alive(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  const survived = alive(pid);
  if (survived) process.kill(pid, 'SIGKILL');
  assert.equal(survived, false, `process ${pid} outlived the command's limit`);
}

/** Run a script in its own process group, killed as a whole at the test's deadline. */
function runScript(script, args, { cwd, env }) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let output = '', timedOut = false;
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group already ended */ }
    }, DEADLINE_MS);
    child.once('error', reject);
    child.once('close', status => {
      clearTimeout(timer);
      resolve({ status, output, timedOut, elapsedMs: performance.now() - started });
    });
  });
}

function assertStopped(result) {
  assert.equal(result.timedOut, false, `the script ignored its limit:\n${result.output}`);
  assert.notEqual(result.status, 0, result.output);
  assert.ok(result.elapsedMs < STOPPED_WITHIN_MS, `stopped after ${Math.round(result.elapsedMs)} ms`);
  assert.match(result.output, new RegExp(`exceeded its ${LIMIT_SECONDS}s limit`));
}

const limitEnvironment = extra => ({ ...process.env, CRUDUI_COMMAND_LIMIT_SECONDS: String(LIMIT_SECONDS), ...extra });
const SHARED = ['scripts/bounded-command.mjs', 'scripts/test-progress'];

test('run-contract-tests stops a declared command at its limit', async () => {
  const box = sandbox(['scripts/run-contract-tests.mjs', ...SHARED]);
  try {
    const hang = box.program('hang');
    mkdirSync(path.join(box.root, 'contracts'));
    writeFileSync(path.join(box.root, 'contracts/features.json'), JSON.stringify({
      features: [{ id: 'hanging', verification: [{ id: 'forever', command: hang }] }],
    }));
    const result = await runScript(path.join(box.root, 'scripts/run-contract-tests.mjs'), [], { cwd: box.root, env: limitEnvironment() });
    assertStopped(result);
    await assertGone(box.pidFile);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('require-current-build stops the build at its limit', async () => {
  const box = sandbox(['scripts/require-current-build.mjs', 'package.json', 'package-lock.json', ...SHARED]);
  try {
    box.program('npm');
    const result = await runScript(path.join(box.root, 'scripts/require-current-build.mjs'), [], {
      cwd: box.root, env: limitEnvironment({ PATH: path.join(box.root, 'bin') }),
    });
    assertStopped(result);
    await assertGone(box.pidFile);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('gen-api-docs stops a documentation tool at its limit', async () => {
  const box = sandbox(['scripts/gen-api-docs.mjs', 'scripts/run-rust-command.mjs', 'scripts/tool-resolution.mjs', ...SHARED]);
  try {
    box.program('go');
    mkdirSync(path.join(box.root, 'packages/validator-go'), { recursive: true });
    const result = await runScript(path.join(box.root, 'scripts/gen-api-docs.mjs'), ['go'], {
      cwd: box.root, env: limitEnvironment({ PATH: path.join(box.root, 'bin'), GO: 'go' }),
    });
    assertStopped(result);
    await assertGone(box.pidFile);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('gen-api-docs prints the elapsed time of each command', async () => {
  const box = sandbox(['scripts/gen-api-docs.mjs', 'scripts/run-rust-command.mjs', 'scripts/tool-resolution.mjs', ...SHARED]);
  try {
    // A Go tool that lists one package and documents it.
    writeFileSync(path.join(box.root, 'bin/go'), `#!${process.execPath}\n`
      + "process.stdout.write(process.argv[2] === 'list' ? 'example.com/one\\n' : 'package one\\n');\n");
    chmodSync(path.join(box.root, 'bin/go'), 0o755);
    for (const name of ['validator-go', 'generator-go']) mkdirSync(path.join(box.root, 'packages', name), { recursive: true });
    const result = await runScript(path.join(box.root, 'scripts/gen-api-docs.mjs'), ['go'], {
      cwd: box.root, env: { ...process.env, PATH: path.join(box.root, 'bin'), GO: 'go' },
    });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /✔ go list .* \(\d+\.\ds\)/);
    assert.match(result.output, /✔ go doc -all example\.com\/one \(\d+\.\ds\)/);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test('run.js stops a driver and every process it started at the limit', async () => {
  // The JavaScript driver starts as `node` from PATH; here that program never ends.
  const box = sandbox(['tools/bench/run.js', 'tools/bench/arguments.js', 'tools/bench/fixtures', ...SHARED]);
  try {
    box.program('node');
    const result = await runScript(path.join(box.root, 'tools/bench/run.js'), ['--only', 'js', '--json'], {
      cwd: box.root, env: limitEnvironment({ PATH: path.join(box.root, 'bin') }),
    });
    assertStopped(result);
    await assertGone(box.pidFile);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});
