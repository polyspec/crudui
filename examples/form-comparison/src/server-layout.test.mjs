import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('uses the candidate source archive and extracted source directory', () => {
  assert.match(server, /['"]\/archives\/source\.tar['"]/);
  assert.match(server, /['"]\/workspace\/source\/examples\/form-comparison\/api\.php['"]/);
  assert.doesNotMatch(server, /\/archives\/keyed\.tar|\/workspace\/keyed/);
});

test('starts one current process for each server implementation', () => {
  assert.match(server, /['"]\/workspace\/bin\/go['"]/);
  assert.match(server, /['"]\/workspace\/bin\/rust['"]/);
  assert.doesNotMatch(server, /(?:go|rust)-(?:original|corrected|keyed)/);
  assert.doesNotMatch(server, /const revisions|original-keyed/);
});

test('uses the current public API parser and forwards the rendering path', () => {
  assert.match(server, /parseFormApiPath\(url\.pathname\)/);
  assert.match(server, /\/api\/\$\{action\}\/\$\{renderingPath\}\/\$\{framework\}/);
  assert.doesNotMatch(server, /corrected\|original|original\|original-keyed|original-keyed\|keyed/);
});
