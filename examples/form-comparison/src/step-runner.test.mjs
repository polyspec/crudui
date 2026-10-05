import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assertStep, formatDuration, killProcessTree, processTree, runStages, runStep,
} from './step-runner.mjs';

const execFileAsync = promisify(execFile);

function recorder() {
  const lines = [];
  return { lines, write: text => lines.push(...text.split('\n').filter(Boolean)) };
}

function node(id, source) {
  return { id, command: process.execPath, args: ['-e', source] };
}

test('formats progress durations', () => {
  assert.equal(formatDuration(850), '850ms');
  assert.equal(formatDuration(42_149), '42.1s');
  assert.equal(formatDuration(184_000), '3m04s');
});

test('selects a process and every descendant', () => {
  const table = [
    { pid: 1, ppid: 0 }, { pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }, { pid: 12, ppid: 11 },
    { pid: 20, ppid: 1 }, { pid: 13, ppid: 10 },
  ];
  assert.deepEqual(processTree(10, table), [10, 11, 13, 12]);
  assert.deepEqual(processTree(20, table), [20]);
});

test('a step is a long operation and holds no time limit', () => {
  assert.doesNotThrow(() => assertStep({ id: 'a', command: 'true', args: [] }));
  assert.throws(() => assertStep({ id: 'b', command: 'true', args: [], timeoutMs: 1 }),
    /b: a step runs to its end and holds no time limit/);
  assert.throws(() => assertStep({ id: 'c', command: 'true', args: [], silenceLimitMs: 1 }),
    /c: a step runs to its end and holds no time limit/);
  assert.throws(() => assertStep({ id: 'Upper', command: 'true', args: [] }), /lowercase id/);
});

test('a step that prints nothing for many heartbeats runs to its end', async t => {
  const { lines, write } = recorder();
  // The step opens a named pipe for reading, which blocks without output until the test opens its
  // other end; the test does that only after five heartbeat lines of the runner.
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-silent-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pipe = path.join(directory, 'release');
  await execFileAsync('mkfifo', [pipe]);
  let heartbeats = 0;
  let release;
  const released = new Promise(resolve => { release = resolve; });
  const run = runStep(node('silent', `require('node:fs').openSync(${JSON.stringify(pipe)}, 'r');`), {
    heartbeatMs: 20,
    write: text => {
      write(text);
      if (/: running /.test(text) && ++heartbeats === 5) release();
    },
  });
  await released;
  await (await open(pipe, 'w')).close();
  const result = await run;
  assert.equal(result.status, 'passed', lines.join('\n'));
  assert.equal(lines[0], '[step] silent: started');
  assert.ok(lines.filter(line => /^\[step\] silent: running \d+ms$/.test(line)).length >= 5, lines.join('\n'));
  assert.deepEqual(Object.keys(result).sort(), ['durationMs', 'exitCode', 'id', 'signal', 'status']);
});

test('streams start, prefixed output, heartbeat and duration of a passing step', async () => {
  const { lines, write } = recorder();
  const result = await runStep(node('sample',
    "console.log('one'); setTimeout(() => console.error('two'), 120)"),
  { write, heartbeatMs: 40 });
  assert.equal(result.status, 'passed');
  assert.equal(lines[0], '[step] sample: started');
  assert.ok(lines.includes('[sample] one'));
  assert.ok(lines.includes('[sample] two'));
  assert.ok(lines.some(line => /^\[step\] sample: running \d+ms$/.test(line)), lines.join('\n'));
  assert.match(lines.at(-1), /^\[step\] sample: passed in \d+ms$/);
});

test('reports a failing step with its exit status and duration', async () => {
  const { lines, write } = recorder();
  const result = await runStep(node('broken', 'process.exit(3)'), { write });
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 3);
  assert.match(lines.at(-1), /^\[step\] broken: failed \(exit 3\) after \d+ms$/);
});

test('runs the steps of one stage together and stops after a failed stage', async t => {
  const { lines, write } = recorder();
  // The two steps of the first stage open the two ends of one named pipe. Opening one end blocks
  // until the other end is open, so the stage ends only when both steps run at the same time.
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-stage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pipe = path.join(directory, 'meet');
  await execFileAsync('mkfifo', [pipe]);
  const meet = flags => `require('node:fs').closeSync(require('node:fs').openSync(${JSON.stringify(pipe)}, '${flags}'));`;
  const results = await runStages([
    [node('first', meet('r')), node('second', meet('w'))],
    [node('failing', 'process.exit(1)')],
    [node('never', '')],
  ], { write });
  assert.deepEqual(results.map(result => [result.id, result.status]),
    [['first', 'passed'], ['second', 'passed'], ['failing', 'failed']]);
  assert.equal(lines.some(line => line.includes('never')), false);
});

test('stops a whole process tree whose group holds only exited processes', async () => {
  // The child starts a grandchild in its own session, as Chromium's helpers do; both ignore SIGTERM.
  // After the grace both are killed; the child's group then holds only the exited child, which a
  // group signal on macOS can answer with EPERM. The stop is still complete and does not fail.
  // The grandchild holds the child's standard output, so the output ends only when both are gone.
  const source = [
    "const { spawn } = require('node:child_process');",
    "spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { detached: true, stdio: ['ignore', 'inherit', 'ignore'] });",
    "console.log('started');",
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
  ].join('\n');
  for (let run = 0; run < 10; run++) {
    const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
    const ended = new Promise(resolve => child.stdout.once('end', resolve));
    await new Promise(resolve => child.stdout.setEncoding('utf8').once('data', resolve));
    child.stdout.resume();
    await killProcessTree(child, 100);
    assert.equal(child.signalCode, 'SIGKILL');
    await ended;
  }
});
