import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assertStep, formatDuration, processTree, runStages, runStep,
} from './step-runner.mjs';

const execFileAsync = promisify(execFile);

function recorder() {
  const lines = [];
  return { lines, write: text => lines.push(...text.split('\n').filter(Boolean)) };
}

function node(id, source, timeoutMs = 10_000) {
  return { id, command: process.execPath, args: ['-e', source], timeoutMs };
}

async function alive(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  // A zombie still accepts signal 0 until its parent reaps it.
  const { stdout } = await execFileAsync('ps', ['-o', 'stat=', '-p', String(pid)])
    .catch(() => ({ stdout: '' }));
  return stdout.trim() !== '' && !stdout.trim().startsWith('Z');
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

test('requires every step to declare its own timeout', () => {
  assert.throws(() => assertStep({ id: 'a', command: 'true', args: [] }),
    /a: every step requires its own timeout/);
  assert.throws(() => assertStep({ id: 'Upper', command: 'true', args: [], timeoutMs: 1 }),
    /lowercase id/);
});

test('streams start, prefixed output, heartbeat and duration of a passing step', async () => {
  const { lines, write } = recorder();
  const result = await runStep(node('sample',
    "console.log('one'); setTimeout(() => console.error('two'), 120)"),
  { write, heartbeatMs: 40 });
  assert.equal(result.status, 'passed');
  assert.equal(lines[0], '[step] sample: started (timeout 10.0s)');
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

test('kills the whole process tree of a step that reaches its timeout', async () => {
  const { lines, write } = recorder();
  // The step starts a grandchild in its own session, as Chromium's helpers do, and ignores SIGTERM.
  const source = [
    "const { spawn } = require('node:child_process');",
    "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { detached: true, stdio: 'ignore' });",
    "console.log('grandchild ' + child.pid);",
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
  ].join('\n');
  const started = performance.now();
  const result = await runStep({ ...node('hung', source), timeoutMs: 300 }, { write });
  assert.equal(result.status, 'timed-out');
  assert.ok(performance.now() - started < 10_000, 'the grace period bounds the kill');
  const grandchild = Number(lines.find(line => line.startsWith('[hung] grandchild '))?.split(' ').at(-1));
  assert.ok(Number.isInteger(grandchild), lines.join('\n'));
  assert.equal(await alive(grandchild), false, 'the detached grandchild was killed');
  assert.ok(lines.includes('[step] hung: timeout after 300ms; killing its process tree')
    || lines.some(line => /^\[step\] hung: timeout after \d+ms; killing its process tree$/.test(line)));
  assert.match(lines.at(-1), /^\[step\] hung: timed out after \d+(?:ms|\.\ds)$/);
});

test('runs the steps of one stage together and stops after a failed stage', async () => {
  const { lines, write } = recorder();
  const started = performance.now();
  const results = await runStages([
    [node('first', 'setTimeout(() => {}, 300)'), node('second', 'setTimeout(() => {}, 300)')],
    [node('failing', 'process.exit(1)')],
    [node('never', '')],
  ], { write });
  assert.ok(performance.now() - started < 1_200, 'one stage runs its steps at the same time');
  assert.deepEqual(results.map(result => [result.id, result.status]),
    [['first', 'passed'], ['second', 'passed'], ['failing', 'failed']]);
  assert.equal(lines.some(line => line.includes('never')), false);
});
