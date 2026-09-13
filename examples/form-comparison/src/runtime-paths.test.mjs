import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formFrameworks, formInitializations, formRenderingPaths, formServers, formTransports,
  framePath, initializationCategories, initializationCombinations, initializationComparisons,
  initializationStages,
  parseFormApiPath, reportCombinations,
} from './runtime-paths.mjs';

test('defines the complete current browser matrix', () => {
  assert.deepEqual(formRenderingPaths, ['bindForm', 'createForm']);
  assert.deepEqual(formServers, ['php', 'php-ext', 'go', 'rust']);
  assert.deepEqual(formFrameworks, ['react', 'vue', 'svelte']);
  assert.deepEqual(formTransports, ['form', 'json']);
  assert.equal(reportCombinations().length, 12);
  assert.deepEqual(reportCombinations().at(0), {
    path: 'bindForm', framework: 'react', transport: 'form',
  });
  assert.deepEqual(reportCombinations().at(-1), {
    path: 'createForm', framework: 'svelte', transport: 'json',
  });
  assert.deepEqual(formInitializations, ['ssr', 'csr']);
  assert.deepEqual(initializationCombinations().length, 6);
  assert.equal(initializationStages.length, 18);
  assert.equal(initializationComparisons.length * initializationCategories.length, 192);
});

test('parses only complete current API paths', () => {
  assert.deepEqual(parseFormApiPath('/api/php-ext/save/bindForm/vue'), {
    server: 'php-ext', action: 'save', path: 'bindForm', framework: 'vue',
  });
  assert.deepEqual(parseFormApiPath('/api/rust/ssr/createForm/svelte'), {
    server: 'rust', action: 'ssr', path: 'createForm', framework: 'svelte',
  });
  for (const invalid of [
    '/api/php/save/other/react',
    '/api/other/save/bindForm/react',
    '/api/php/other/bindForm/react',
    '/api/php/save/bindForm/other',
    '/api/php/save/bindForm/react/extra',
  ]) assert.equal(parseFormApiPath(invalid), null);
});

test('creates one frame URL for each rendering path', () => {
  assert.equal(framePath('bindForm', 'react'), '/frames/bindForm-react/');
  assert.equal(framePath('createForm', 'svelte'), '/frames/createForm-svelte/');
  assert.throws(() => framePath('other', 'react'), /rendering path/);
  assert.throws(() => framePath('bindForm', 'other'), /framework/);
});
