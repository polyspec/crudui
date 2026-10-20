import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { watchDocumentation, type DocumentationWatchListener } from '../../scripts/docs-web/watch.mts';

const source = await readFile(
  new URL('../../scripts/docs-web/cli.mts', import.meta.url), 'utf8',
);

test('documentation development rebuilds use file-system events', () => {
  assert.equal(source.includes('setInterval'), false,
    'documentation development must not use a periodic timer');
  assert.equal(source.includes('snapshot('), false,
    'documentation development must not scan every source file periodically');
  assert.match(source, /watchDocumentation/,
    'documentation development must subscribe to source changes');
});

test('documentation source events serialize rebuilds and exclude generated output', async () => {
  const events = new EventEmitter();
  let receive: DocumentationWatchListener | undefined;
  let closed = false;
  let releaseFirst: (() => void) | undefined;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const builds: number[] = [];
  const failures: unknown[] = [];
  const subscription = watchDocumentation('/repository/docs', async () => {
    builds.push(builds.length + 1);
    if (builds.length === 1) await first;
  }, {
    watch(directory, options, listener) {
      assert.equal(directory, '/repository/docs');
      assert.deepEqual(options, { recursive: true });
      receive = listener;
      return Object.assign(events, { close: () => { closed = true; } });
    },
    onBuildError: error => failures.push(error),
  });

  assert.ok(receive, 'the watch subscribed');
  receive('change', 'guide.md');
  assert.deepEqual(builds, [1]);
  receive('rename', 'guide.md');
  receive('change', 'reference/api.md');
  receive('change', '.web/dist/guide.html');
  assert.ok(releaseFirst, 'the promise executor ran');
  releaseFirst();
  await subscription.idle();
  assert.deepEqual(builds, [1, 2]);
  assert.deepEqual(failures, []);

  receive('change', '.web/dist/index.html');
  await subscription.idle();
  assert.deepEqual(builds, [1, 2]);
  subscription.close();
  assert.equal(closed, true);
  receive('change', 'after-close.md');
  await subscription.idle();
  assert.deepEqual(builds, [1, 2]);
});

test('documentation watch retains source events until the initial build completes', async () => {
  const events = new EventEmitter();
  let receive: DocumentationWatchListener | undefined;
  const builds: number[] = [];
  const subscription = watchDocumentation('/repository/docs', async () => {
    builds.push(builds.length + 1);
  }, {
    paused: true,
    watch(_directory, _options, listener) {
      receive = listener;
      return Object.assign(events, { close: () => {} });
    },
    onBuildError: error => { throw error; },
  });

  assert.ok(receive, 'the watch subscribed');
  receive('change', 'during-initial-build.md');
  await subscription.idle();
  assert.deepEqual(builds, []);
  subscription.resume();
  await subscription.idle();
  assert.deepEqual(builds, [1]);
  subscription.close();
  assert.throws(() => subscription.resume(), /watch is closed/);
});

test('documentation rebuild failures are reported and later events remain active', async () => {
  const events = new EventEmitter();
  let receive: DocumentationWatchListener | undefined;
  const failures: string[] = [];
  let builds = 0;
  const subscription = watchDocumentation('/repository/docs', async () => {
    builds++;
    if (builds === 1) throw new Error('invalid document');
  }, {
    watch(_directory, _options, listener) {
      receive = listener;
      return Object.assign(events, { close: () => {} });
    },
    onBuildError: error => failures.push(error instanceof Error ? error.message : String(error)),
  });

  assert.ok(receive, 'the watch subscribed');
  receive('change', null);
  await subscription.idle();
  receive('change', 'corrected.md');
  await subscription.idle();
  assert.equal(builds, 2);
  assert.deepEqual(failures, ['invalid document']);
  subscription.close();
});
