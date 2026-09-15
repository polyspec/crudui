import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('./main.mjs', import.meta.url), 'utf8');

test('the public entry owns one linked CRUD pipeline', () => {
  for (const stage of ['list', 'detail', 'form', 'save', 'refresh']) assert.match(html, new RegExp(`data-stage="${stage}"`));
  assert.match(script, /link\('detail'/);
  assert.match(script, /link\('form'/);
  assert.doesNotMatch(html + script, /\/displays\//);
});

test('the public entry declares the complete runtime selection', () => {
  for (const server of ['js', 'php', 'php-ext', 'go', 'rust']) assert.match(html, new RegExp(`value="${server}"`));
  for (const framework of ['html', 'react', 'vue', 'svelte']) assert.match(html, new RegExp(`value="${framework}"`));
  for (const initialization of ['csr', 'ssr']) assert.match(html, new RegExp(`value="${initialization}"`));
});
