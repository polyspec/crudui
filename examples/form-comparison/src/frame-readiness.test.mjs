import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { frameUrl, loadComparisonFrames, parseFrameDocument } from './frame-readiness.mjs';

// The benchmark console is the page that loads the comparison frames.
const consoleSource = await readFile(new URL('../benchmark-console/main.mjs', import.meta.url), 'utf8');

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
    '/api/php/ssr/createForm/react?lang=ko&server=php&initialization=ssr',
    '/frames/createForm-react/?lang=ko&server=php&initialization=csr',
  ]);
  value.ready(value.frames[1]);
  assert.deepEqual(ready, ['csr']);
  value.ready(value.frames[0]);
  await loading;
  assert.deepEqual(ready, ['csr', 'ssr']);
});

test('rejects with the reason a frame reports when it cannot initialize', async () => {
  const value = fixture();
  const loading = loadComparisonFrames({
    host: value.host,
    frames: value.frames,
    initializations: ['ssr', 'csr'], path: 'createForm',
    framework: 'react', server: 'php', language: 'ko',
    title: initialization => initialization,
    onReady: () => {},
  });
  value.ready(value.frames[0], { type: 'crudui:frame-failed', reason: 'Hydration must keep every server-rendered element' });
  await assert.rejects(loading, /Frame initialization failed: Hydration must keep every server-rendered element/);
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

test('reads back the frame every document URL addresses', () => {
  for (const frame of [
    { initialization: 'ssr', path: 'createForm', framework: 'react', server: 'php', language: 'ko' },
    { initialization: 'csr', path: 'bindForm', framework: 'svelte', server: 'rust', language: 'en' },
  ]) {
    assert.deepEqual(
      parseFrameDocument(new URL(frameUrl(frame), 'http://example.test')),
      { server: frame.server, initialization: frame.initialization, language: frame.language, path: frame.path, framework: frame.framework },
    );
  }
});

test('reads no frame from other documents', () => {
  for (const url of [
    '/', '/frames/createForm-react/', '/api/php/ssr/createForm/react',
    // A frame document is served by its own server on its own path.
    '/api/go/ssr/createForm/react?lang=ko&server=php&initialization=ssr',
    '/frames/createForm-react/?lang=ko&server=php&initialization=ssr',
    '/api/php/ssr/createForm/react?lang=ko&server=php&initialization=csr',
    '/frames/createForm-react/?lang=de&server=php&initialization=csr',
  ]) assert.equal(parseFrameDocument(new URL(url, 'http://example.test')), null, url);
});

test('uses readiness messages without frame polling or timers', () => {
  assert.equal(consoleSource.includes('for (let attempt'), false);
  assert.equal(consoleSource.includes('setTimeout'), false);
  assert.match(consoleSource, /loadComparisonFrames/);
});
