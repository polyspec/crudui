import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('./main.mjs', import.meta.url), 'utf8');

test('the public entry delegates navigation to CRUDUI generated links', () => {
  assert.doesNotMatch(html + script, /data-stage|stage=|List refresh/);
  assert.match(script, /\/api\/pipeline\/\$\{view\}/);
  assert.doesNotMatch(html + script, /\/displays\//);
});

test('the public entry declares the complete runtime selection', () => {
  for (const server of ['js', 'php', 'php-ext', 'go', 'rust']) assert.match(html, new RegExp(`value="${server}"`));
  for (const framework of ['html', 'react', 'vue', 'svelte']) assert.match(html, new RegExp(`value="${framework}"`));
  for (const initialization of ['csr', 'ssr']) assert.match(html, new RegExp(`value="${initialization}"`));
});

test('the canonical form has a real link back to the list and one bounded frame', () => {
  assert.match(html, /data-view="list"/);
  assert.match(html, /id="form-frame"/);
  assert.doesNotMatch(html, /id="ssr"|id="csr"/);
});

test('runtime selection writes the newly selected initialization into the navigation URL', () => {
  assert.match(script, /state\[control\] = event\.target\.value/);
  assert.match(script, /location\.href = `\$\{location\.pathname\}\?\$\{params/);
  assert.match(script, /initialization: state\.initialization/);
});
