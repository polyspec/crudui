import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { waitForCandidateReadiness } from './candidate-readiness.mjs';

const commit = 'a'.repeat(40);
const expected = { commit, servers: ['php', 'php-ext', 'go', 'rust'] };
const source = await readFile(new URL('./candidate-readiness.mjs', import.meta.url), 'utf8');

async function temporary(t) {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()),
    'crudui-candidate-readiness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function controlledWatcher() {
  const watcher = new EventEmitter();
  watcher.closed = false;
  watcher.close = () => { watcher.closed = true; };
  return watcher;
}

test('subscribes before start and accepts one complete readiness event', async t => {
  const directory = await temporary(t);
  const file = path.join(directory, 'candidate-ready.json');
  const watcher = controlledWatcher();
  const actions = [];
  const result = waitForCandidateReadiness({
    file,
    expected,
    watchDirectory(parent, listener) {
      actions.push(['watch', parent]);
      watcher.on('change', listener);
      return watcher;
    },
    async start() {
      actions.push(['start']);
      watcher.emit('change', 'rename', null);
      await new Promise(resolve => setImmediate(resolve));
      await writeFile(file, JSON.stringify(expected) + '\n');
      watcher.emit('change', 'rename', path.basename(file));
      return { completion: new Promise(() => {}) };
    },
  });
  assert.deepEqual(await result, expected);
  assert.deepEqual(actions, [['watch', directory], ['start']]);
  assert.equal(watcher.closed, true);
});

test('fails when the container exits before readiness', async t => {
  const directory = await temporary(t);
  const watcher = controlledWatcher();
  await assert.rejects(waitForCandidateReadiness({
    file: path.join(directory, 'candidate-ready.json'),
    expected,
    watchDirectory(_parent, listener) {
      watcher.on('change', listener);
      return watcher;
    },
    async start() {
      return { completion: Promise.resolve({ code: 7, signal: null }) };
    },
  }), /Candidate container exited before readiness: 7/);
  assert.equal(watcher.closed, true);
});

test('rejects an existing readiness path before starting the container', async t => {
  const directory = await temporary(t);
  const file = path.join(directory, 'candidate-ready.json');
  await writeFile(file, JSON.stringify(expected) + '\n');
  let started = false;
  await assert.rejects(waitForCandidateReadiness({
    file,
    expected,
    watchDirectory() { throw new Error('watch must not start'); },
    async start() { started = true; },
  }), /Candidate readiness path already exists/);
  assert.equal(started, false);
});

test('rejects relative paths and invalid readiness contents', async t => {
  await assert.rejects(waitForCandidateReadiness({
    file: 'candidate-ready.json', expected,
    watchDirectory() { throw new Error('watch must not start'); },
    async start() {},
  }), /Candidate readiness path must be absolute/);

  const directory = await temporary(t);
  const file = path.join(directory, 'candidate-ready.json');
  const watcher = controlledWatcher();
  await assert.rejects(waitForCandidateReadiness({
    file,
    expected,
    watchDirectory(_parent, listener) {
      watcher.on('change', listener);
      return watcher;
    },
    async start() {
      await writeFile(file, JSON.stringify({ ...expected, commit: 'b'.repeat(40) }) + '\n');
      watcher.emit('change', 'rename', path.basename(file));
      return { completion: new Promise(() => {}) };
    },
  }), /Candidate readiness contents differ/);
});

test('uses filesystem and process events without polling or timers', () => {
  assert.equal(source.includes('setTimeout'), false);
  assert.equal(source.includes('setInterval'), false);
  assert.equal(source.includes('for (let attempt'), false);
});
