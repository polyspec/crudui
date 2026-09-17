import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { interactionCombinations } from './check-interaction.mjs';
import { formFrameworks, formRenderingPaths, formTransports } from './src/runtime-paths.mjs';

const interactionSource = await readFile(
  new URL('./check-interaction.mjs', import.meta.url), 'utf8',
);
const runnerSource = await readFile(new URL('./check.mjs', import.meta.url), 'utf8');
const frameSource = await readFile(new URL('./src/frame.mjs', import.meta.url), 'utf8');
// The benchmark console owns the comparison frames and their main-page readiness event.
const consoleSource = await readFile(new URL('./benchmark-console/main.mjs', import.meta.url), 'utf8');

test('uses the complete current interaction matrix for each server', () => {
  const combinations = interactionCombinations(['php']);
  // Five actions: pointer, keyboard, condition, validation and empty-keyboard.
  assert.equal(combinations.length,
    formRenderingPaths.length * formFrameworks.length * formTransports.length * 5);
  assert.deepEqual(combinations[0], {
    server: 'php', framework: 'react', path: 'bindForm',
    transport: 'form', action: 'pointer',
  });
  assert.deepEqual(combinations.at(-1), {
    server: 'php', framework: formFrameworks.at(-1), path: 'createForm',
    transport: 'json', action: 'empty-keyboard',
  });
});

test('interaction verification uses readiness and operation completion events', () => {
  assert.equal(interactionSource.includes('waitForFunction'), false,
    'interaction verification must not read browser state periodically');
  assert.equal(interactionSource.includes('requestAnimationFrame'), false,
    'interaction verification must await the renderer operation');
  assert.equal(runnerSource.includes("waitUntil: 'networkidle0'"), false,
    'the runner must use the main-page readiness event');
  assert.equal(runnerSource.includes('waitForFunction'), false,
    'the runner must not read main-page readiness periodically');
  assert.match(interactionSource, /window\.comparison\.nextAction\(/);
  assert.match(interactionSource, /window\.comparison\.idle\(\)/);
  assert.match(frameSource, /nextAction/);
  assert.match(consoleSource, /crudui:main-ready/);
});
