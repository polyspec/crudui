import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';
import { JSDOM } from 'jsdom';

import { interactionCombinations, rowActionSelector } from './check-interaction.mjs';
import { specFor } from './src/scenario.mjs';
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

test('finds the row actions it presses in the rendered comparison form', () => {
  const data = { companies: { __0000000000001__: { name: 'Company A', stores: {} } } };
  const html = renderForm(createForm(compileForm(specFor()), data, { language: 'ko' }));
  const { document } = new JSDOM(html).window;
  for (const action of ['add-row', 'remove-row']) {
    assert.ok(document.querySelector(rowActionSelector(action)), `${action} is found by ${rowActionSelector(action)}`);
  }
});

test('each initialization column resets the repository and loads its frame document again', () => {
  // The `mounted` stage is the column's own initialization from the reset record, whatever an
  // earlier check left in the repository.
  const body = consoleSource.slice(consoleSource.indexOf('async function compareInitialization'),
    consoleSource.indexOf('function renderInitialization'));
  assert.match(body, /await remountColumn\(index\)/);
  assert.doesNotMatch(body, /comparison\.reset\(\)/);
  const remount = consoleSource.slice(consoleSource.indexOf('async function remountColumn'));
  assert.match(remount, /resetRecord\('populated'\)[\s\S]*loadComparisonFrames\(\{[\s\S]*frames: \[frames\[index\]\]/);
});
