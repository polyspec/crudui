// The host's source watcher and the supervisor's comparisons follow change events: the watcher
// signals the supervisor for every file event of the working tree, and neither of them compares or
// signals on a timer.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sourceChangeCommand } from '../comparison-deployment.mjs';
import { watchSourceEvents } from '../source-events.mjs';
import { changeRequests } from './change-requests.mjs';

/** A watch the test drives: `emit` sends one file event. */
function fakeWatch() {
  const watch = { stopped: false };
  watch.subscribe = (root, onEvent, onError) => {
    watch.root = root;
    watch.emit = file => onEvent('change', file);
    watch.error = onError;
    return () => { watch.stopped = true; };
  };
  return watch;
}

test('a request during a run makes exactly one more run after it', async () => {
  const runs = [];
  let release;
  const requests = changeRequests(async () => {
    runs.push(runs.length + 1);
    if (runs.length === 1) await new Promise(resolve => { release = resolve; });
  });
  const first = requests.request();
  assert.equal(requests.request(), undefined);
  assert.equal(requests.request(), undefined);
  release();
  await first;
  assert.deepEqual(runs, [1, 2]);
  await requests.request();
  assert.deepEqual(runs, [1, 2, 3]);
});

test('the source watcher signals the supervisor for file events and prints every step', async () => {
  const watch = fakeWatch();
  const lines = [];
  const deliveries = [];
  const delivered = [];
  watchSourceEvents({
    root: '/repository', watch: watch.subscribe, write: text => lines.push(text),
    deliver: () => new Promise(resolve => { deliveries.push(resolve); }),
  }).catch(error => assert.fail(error));
  assert.equal(watch.root, '/repository');
  watch.emit('packages/a.ts');
  assert.equal(deliveries.length, 1, 'the first event starts a delivery');
  // Events during a delivery make one more delivery after it.
  watch.emit('packages/b.ts');
  watch.emit('packages/c.ts');
  deliveries[0]();
  await new Promise(setImmediate);
  assert.equal(deliveries.length, 2);
  deliveries[1]();
  await new Promise(setImmediate);
  delivered.push(...lines);
  assert.match(delivered.join(''), /^\[source-events\] watching \/repository$/m);
  assert.match(delivered.join(''), /^\[source-events\] change packages\/b\.ts$/m);
  assert.match(delivered.join(''), /^\[source-events\] delivery 2: delivered in \d+ms$/m);
  assert.equal(deliveries.length, 2, 'no delivery without an event');
});

test('a failed delivery ends the source watcher with its error', async () => {
  const watch = fakeWatch();
  const watching = watchSourceEvents({
    root: '/repository', watch: watch.subscribe, write: () => {},
    deliver: async () => { throw new Error('container crudui-comparison is not running'); },
  });
  watch.emit('a');
  await assert.rejects(watching, /container crudui-comparison is not running/);
  assert.equal(watch.stopped, true);
});

test('the source watcher signals the supervisor inside the container', () => {
  assert.deepEqual(sourceChangeCommand('crudui-comparison'), ['exec', '--user', 'node', 'crudui-comparison', 'node',
    '/workspace/source/examples/form-comparison/source-changed.mjs']);
});

test('the supervisor compares the repository at change signals, not on a timer', async () => {
  const supervisor = await readFile(new URL('../supervisor.mjs', import.meta.url), 'utf8');
  assert.match(supervisor, /process\.on\('SIGUSR2'/, 'the supervisor subscribes to the change signal');
  assert.match(supervisor, /supervisorProcessFile/, 'the supervisor records its process id');
  assert.doesNotMatch(supervisor, /checkInterval|setTimeout\(|setInterval\(/, 'the supervisor runs no timer');
  const signal = await readFile(new URL('../source-changed.mjs', import.meta.url), 'utf8');
  assert.match(signal, /process\.kill\(pid, 'SIGUSR2'\)/);
});

test('the Git calls of the source comparison and the OrderedJSON checkout hold no timeout', async () => {
  for (const file of ['./source-tree.mjs', './ordered-json-source.mjs']) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /\btimeout\b|TimeoutMs/, file);
  }
});

test('a stopped source watcher closes its watch and prints its stop', async () => {
  const watch = fakeWatch();
  const lines = [];
  const controller = new AbortController();
  const watching = watchSourceEvents({
    root: '/repository', watch: watch.subscribe, write: text => lines.push(text), deliver: async () => {},
    stop: controller.signal,
  });
  watch.emit('a');
  await new Promise(setImmediate);
  controller.abort();
  await watching;
  assert.equal(watch.stopped, true);
  assert.match(lines.join(''), /^\[source-events\] stopped after 1 delivery$/m);
});

test('a deployment signals the supervisor before it waits for the build', async () => {
  // A running supervisor compares the checkout only at a change signal, and containerctl also
  // reuses an unchanged container whose supervisor started from an earlier checkout; the deployment
  // sends one signal before it waits for this checkout, in either mode.
  const source = await readFile(new URL('../comparison-deployment.mjs', import.meta.url), 'utf8');
  const main = source.slice(source.indexOf('async function main()'));
  assert.doesNotMatch(main, /application\.mode === 'sync'\) await signalSourceChange/);
  const signal = main.indexOf('await signalSourceChange();');
  assert.ok(signal > 0 && signal < main.indexOf('await awaitBuild();'), 'the signal precedes the wait for the build');
});

test('the supervisor answers on the service port until the public server listens', async () => {
  // containerctl connects to the service port within a minute of the container start, before the
  // first build ends; the supervisor listens there from its start and hands the port over.
  const supervisor = await readFile(new URL('../supervisor.mjs', import.meta.url), 'utf8');
  const listen = supervisor.indexOf('.listen(publicPort');
  assert.ok(listen > 0 && listen < supervisor.indexOf('await runCycle(completeBuild()'), 'the port is open before the first build');
  const start = supervisor.slice(supervisor.indexOf('async function startProcess(name'));
  assert.ok(start.indexOf('releasePublicPort()') > 0
    && start.indexOf('releasePublicPort()') < start.indexOf('spawn('), 'the port is released before the public server starts');
});
