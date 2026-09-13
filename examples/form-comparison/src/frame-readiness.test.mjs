import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadComparisonFrames } from './frame-readiness.mjs';

const mainSource = await readFile(new URL('../public/main.mjs', import.meta.url), 'utf8');

function fixture() {
  const emitter = new EventEmitter();
  const host = {
    location: { origin: 'http://example.test' },
    addEventListener: (name, listener) => emitter.on(name, listener),
    removeEventListener: (name, listener) => emitter.off(name, listener),
  };
  const frames = ['ssr', 'csr'].map(initialization => ({
    initialization,
    contentWindow: {},
    title: '',
    src: '',
  }));
  return {
    host,
    frames,
    ready(frame, value = {}) {
      emitter.emit('message', {
        origin: host.location.origin,
        source: frame.contentWindow,
        data: {
          type: 'crudui:frame-ready', server: 'php', framework: 'react',
          path: 'createForm', initialization: frame.initialization, ...value,
        },
      });
    },
  };
}

test('subscribes before navigation and resolves exact frame readiness events', async () => {
  const value = fixture();
  const ready = [];
  const loading = loadComparisonFrames({
    host: value.host,
    frames: value.frames,
    initializations: ['ssr', 'csr'], path: 'createForm',
    framework: 'react', server: 'php', language: 'ko',
    title: initialization => initialization,
    onReady: initialization => ready.push(initialization),
  });
  assert.deepEqual(value.frames.map(frame => frame.src), [
    '/frames/createForm-react/?lang=ko&server=php&initialization=ssr',
    '/frames/createForm-react/?lang=ko&server=php&initialization=csr',
  ]);
  value.ready(value.frames[1]);
  assert.deepEqual(ready, ['csr']);
  value.ready(value.frames[0]);
  await loading;
  assert.deepEqual(ready, ['csr', 'ssr']);
});

test('rejects a readiness event with a different declared frame', async () => {
  const value = fixture();
  const loading = loadComparisonFrames({
    host: value.host,
    frames: value.frames,
    initializations: ['ssr', 'csr'], path: 'createForm',
    framework: 'react', server: 'php', language: 'en',
    title: initialization => initialization,
    onReady: () => {},
  });
  value.ready(value.frames[0], { initialization: 'csr' });
  await assert.rejects(loading, /Frame readiness differs/);
});

test('uses readiness messages without frame polling or timers', () => {
  assert.equal(mainSource.includes('for (let attempt'), false);
  assert.equal(mainSource.includes('setTimeout'), false);
  assert.match(mainSource, /loadComparisonFrames/);
});
