// The benchmark drivers take their iteration counts from the command line. Every driver and the
// orchestrator apply one rule to them, read from tests/fixtures/bench/iteration-arguments.json: a
// count is decimal digits inside its range, and anything else stops the program before it loads a
// validator, with the same message. An unchecked count such as `--iters 1e20` used to loop without
// end. Each driver runs as the README documents it; the Go and Rust drivers compile on their first
// run, which the accepted case pays.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENCH = path.join(ROOT, 'tools/bench');
const FIXTURES = path.join(BENCH, 'fixtures');
const cases = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/bench/iteration-arguments.json'), 'utf8'));

const programs = {
  'bench-js.js': { command: process.execPath, args: [path.join(BENCH, 'bench-js.js')], cwd: BENCH },
  'bench-php.php': { command: process.env.PHP ?? 'php', args: [path.join(BENCH, 'bench-php.php')], cwd: BENCH },
  'go/main.go': { command: process.env.GO ?? 'go', args: ['run', '.', '--fixtures', FIXTURES], cwd: path.join(BENCH, 'go') },
  'rust/main.rs': {
    command: process.execPath,
    args: [path.join(ROOT, 'scripts/run-rust-command.mjs'), 'run', '--release', '--quiet', '--', '--fixtures', FIXTURES],
    cwd: path.join(BENCH, 'rust'),
  },
};

/**
 * Run one program in its own process group; at the deadline the whole group is killed, so a
 * driver that loops without end fails this test instead of outliving it.
 */
function run({ command, args, cwd }, extra, deadlineMs) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, ...extra], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group already ended */ }
    }, deadlineMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', status => {
      clearTimeout(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* no process of the group is left */ }
      resolve({ status, stdout, stderr, timedOut, elapsedMs: performance.now() - started });
    });
  });
}

const rows = stdout => stdout.split('\n').filter(line => line.trim().startsWith('{')).map(line => JSON.parse(line));

for (const [name, program] of Object.entries(programs)) {
  test(`${name} accepts a count inside the range`, { timeout: 600_000 }, async () => {
    const result = await run(program, cases.accepted.args, 590_000);
    assert.equal(result.timedOut, false, `${name} did not finish`);
    assert.equal(result.status, 0, result.stderr);
    const [row, ...rest] = rows(result.stdout);
    assert.deepEqual(rest, []);
    assert.equal(row.spec, 'contact');
    assert.equal(row.iters, cases.accepted.iters);
  });

  test(`${name} rejects every count outside the rule with the shared message`, { timeout: 120_000 }, async () => {
    for (const { args, message } of cases.rejected) {
      const result = await run(program, args, 20_000);
      const label = `${name} ${args.join(' ')}`;
      assert.equal(result.timedOut, false, `${label} kept running`);
      assert.notEqual(result.status, 0, label);
      assert.deepEqual(rows(result.stdout), [], label);
      assert.ok(result.stderr.split('\n').includes(message), `${label}: ${JSON.stringify(result.stderr)}`);
    }
  });
}

test('run.js rejects every count outside the rule before it starts a driver', { timeout: 60_000 }, async () => {
  const orchestrator = { command: process.execPath, args: [path.join(BENCH, 'run.js'), '--json'], cwd: BENCH };
  for (const { args, message } of cases.rejected) {
    const result = await run(orchestrator, args, 10_000);
    const label = `run.js ${args.join(' ')}`;
    assert.equal(result.timedOut, false, `${label} kept running`);
    assert.equal(result.status, 2, label);
    assert.equal(result.stderr, `${message}\n`, label);
    assert.equal(result.stdout, '', label);
  }
});
