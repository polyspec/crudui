// The reproducible build check. scripts/repeat-build.mjs builds the packages twice as a logged
// step and records the output of each build; these tests compare the records with each other and
// with the current output, so a record of an earlier tree fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildOutputs, PACKAGES, REPEAT_BUILD_DIRECTORY } from '../../scripts/package-outputs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// contracts/features.json records every published npm package; the check compares all of them.
const published = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8')).packages
  .map(({ path }) => relative(resolve(root, 'packages'), resolve(root, path)));
const record = name => JSON.parse(readFileSync(join(REPEAT_BUILD_DIRECTORY, `${name}.json`), 'utf8'));

test('the reproducible build check covers every published package', () => {
  assert.deepEqual([...PACKAGES].sort(), [...published].sort());
});

test('two official builds produce identical package output bytes', () => {
  assert.deepEqual(record('second'), record('first'));
});

test('the recorded builds are the current package output', () => {
  assert.deepEqual(buildOutputs(), record('second'));
});
