// `npm run lint` checks every JavaScript, TypeScript, Vue and Svelte source the repository owns.
// A tracked source that the lint command does not reach, that the ESLint configuration ignores,
// or that no configuration entry matches fails this check. Only generated or installed output,
// which Git does not track, is left to the configuration's ignore list.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ESLint } from 'eslint';

const root = path.resolve(import.meta.dirname, '../..');
const sourcePattern = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte)$/;

// Tracked sources plus new files that are not ignored; a tracked file deleted in the working tree
// is no longer a source.
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(file => sourcePattern.test(file) && existsSync(path.join(root, file)));

/** The paths `npm run lint` hands to ESLint. */
function lintTargets() {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const words = scripts.lint.split(/\s+/);
  assert.equal(words[0], 'eslint', `npm run lint must run ESLint: ${scripts.lint}`);
  const targets = [];
  for (let index = 1; index < words.length; index++) {
    if (words[index] === '--max-warnings') index++;
    else if (!words[index].startsWith('-')) targets.push(path.posix.normalize(words[index]));
  }
  return targets;
}

const withinTarget = (file, targets) => targets.some(target => target === '.' || file === target || file.startsWith(`${target}/`));

/** Sources the lint command does not lint, each with the reason. */
async function uncovered(files, targets) {
  const eslint = new ESLint({ cwd: root });
  const missing = [];
  for (const file of files) {
    if (!withinTarget(file, targets)) missing.push(`${file}: outside the lint command's paths (${targets.join(' ')})`);
    // ESLint skips a file that the configuration ignores or that no `files` entry matches.
    else if (await eslint.isPathIgnored(file) || !(await eslint.calculateConfigForFile(file))) {
      missing.push(`${file}: eslint.config.mjs ignores it or no entry matches it`);
    }
  }
  return missing;
}

test('the coverage check finds sources the lint command leaves out', async () => {
  assert.deepEqual(await uncovered(['packages/validator-ts/dist/index.js'], ['.']), [
    'packages/validator-ts/dist/index.js: eslint.config.mjs ignores it or no entry matches it',
  ]);
  assert.deepEqual(await uncovered(['scripts/run-tests.mjs'], ['packages']), [
    "scripts/run-tests.mjs: outside the lint command's paths (packages)",
  ]);
  assert.deepEqual(await uncovered(['notes/example.txt'], ['.']), [
    'notes/example.txt: eslint.config.mjs ignores it or no entry matches it',
  ]);
});

test('npm run lint covers every JavaScript, TypeScript, Vue and Svelte source', async () => {
  assert.ok(sources.length > 0, 'git must list the repository sources');
  assert.ok(sources.some(file => file.endsWith('.svelte')), 'the source list must include Svelte components');
  assert.deepEqual(await uncovered(sources, lintTargets()), []);
});
