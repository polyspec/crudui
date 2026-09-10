import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = Object.fromEntries(await Promise.all([
  ['frame', './frame.mjs'],
  ['react', './adapters/create-form-react.tsx'],
  ['vue', './adapters/create-form-vue.ts'],
  ['svelte', './adapters/create-form-svelte.ts'],
].map(async ([name, file]) => [
  name, await readFile(new URL(file, import.meta.url), 'utf8'),
])));

test('create-form adapters publish framework rendering completion', () => {
  assert.equal(sources.frame.includes('requestAnimationFrame'), false,
    'the frame must not infer renderer completion from animation frames');
  for (const framework of ['react', 'vue', 'svelte']) {
    assert.match(sources[framework], /idle:/, `${framework} must publish renderer completion`);
  }
  assert.match(sources.react, /flushSync/);
  assert.match(sources.vue, /nextTick/);
  assert.match(sources.svelte, /flushSync/);
});
