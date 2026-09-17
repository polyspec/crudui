import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assertStep, formatDuration, isProgressLine, processTree, runStages, runStep,
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
  // A single operation holds a total limit; a step made of units holds an inactivity limit. Never both.
  assert.throws(() => assertStep({ id: 'b', command: 'true', args: [], timeoutMs: 1, silenceLimitMs: 1 }),
    /b: every step requires its own timeout/);
  assert.doesNotThrow(() => assertStep({ id: 'c', command: 'true', args: [], silenceLimitMs: 1 }));
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

test('recognizes the progress lines of units, also under nested step prefixes', () => {
  for (const line of [
    '[pipeline] js/html/csr: started (timeout 1m00s)',
    '[php] main-page: running 15.0s',
    '[php] php/bindForm/react/initialization: passed in 31.2s',
    '[browser-php] [php] interactions: failed after 2.0s: Error',
    '[verification] browser-go: timed out after 45.0s',
    '[verification] browser-go: stalled after 45.0s without progress',
  ]) assert.equal(isProgressLine(line), true, line);
  for (const line of ['GET /api/records 200', 'php: something happened', '[php] a warning without a state', '']) {
    assert.equal(isProgressLine(line), false, line);
  }
});

// A child that reports its units: a start, heartbeats and a result, spaced below the silence limit.
const reportingSource = [
  "let n = 0; console.log('[unit] work: started (timeout 1.0s)');",
  "const timer = setInterval(() => { n++; console.log('[unit] work: running ' + n * 100 + 'ms');",
  "  if (n === 12) { clearInterval(timer); console.log('[unit] work: passed in 1.2s'); } }, 100);",
].join('\n');

test('a step made of units has no total limit while it keeps reporting progress', async () => {
  const { lines, write } = recorder();
  const step = { id: 'reporting', command: process.execPath, args: ['-e', reportingSource], silenceLimitMs: 300 };
  const result = await runStep(step, { write, heartbeatMs: 1_000 });
  assert.equal(result.status, 'passed', lines.join('\n'));
  assert.ok(result.durationMs > 3 * step.silenceLimitMs, 'the step outlived its silence limit several times');
  assert.equal(lines[0], '[step] reporting: started (inactivity limit 300ms)');
  assert.equal(result.silenceLimitMs, 300);
  assert.equal(result.timeoutMs, undefined);
});

test('a step made of units that stops reporting progress fails and its process tree is stopped', async () => {
  const { lines, write } = recorder();
  // It prints output that is not a unit progress line, then hangs while ignoring SIGTERM.
  const source = [
    "console.log('[unit] work: started (timeout 1m00s)');",
    "const timer = setInterval(() => console.log('GET /api/records 200'), 50);",
    "process.on('SIGTERM', () => {});",
  ].join('\n');
  const started = performance.now();
  const result = await runStep({ id: 'silent', command: process.execPath, args: ['-e', source], silenceLimitMs: 300 },
    { write, heartbeatMs: 100 });
  assert.equal(result.status, 'stalled', lines.join('\n'));
  assert.ok(performance.now() - started < 10_000, 'the grace period bounds the stop');
  // The runner's own heartbeat is not progress of the child.
  assert.ok(lines.some(line => /^\[step\] silent: running \d+ms$/.test(line)));
  assert.ok(lines.some(line => /^\[step\] silent: no progress for \d+ms; killing its process tree$/.test(line)),
    lines.join('\n'));
  assert.match(lines.at(-1), /^\[step\] silent: stalled after \d+(?:ms|\.\ds) without progress$/);
});
