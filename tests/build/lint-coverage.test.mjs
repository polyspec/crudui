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

import { isVendored } from '../../scripts/repository-files.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sourcePattern = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte)$/;

// Tracked sources plus new files that are not ignored; a tracked file deleted in the working tree
// is no longer a source.
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(file => sourcePattern.test(file) && existsSync(path.join(root, file)) && !isVendored(file));

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
  // An installed file, which exists in every checkout that ran npm ci and which Git ignores.
  assert.deepEqual(await uncovered(['node_modules/eslint/lib/api.js'], ['.']), [
    'node_modules/eslint/lib/api.js: eslint.config.mjs ignores it or no entry matches it',
  ]);
  assert.deepEqual(await uncovered(['scripts/kit/run-tests.mjs'], ['packages']), [
    "scripts/kit/run-tests.mjs: outside the lint command's paths (packages)",
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

// A file under a directory that Git ignores is no source: a stray copy of build output under var/ must not reach ESLint.
test('ESLint ignores every path that Git ignores', async t => {
  const { mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { ignoredPaths } = await import('../../scripts/kit/tracked-files.mjs');
  const stray = path.join(root, 'var/lint-coverage-stray');
  mkdirSync(stray, { recursive: true });
  t.after(() => rmSync(stray, { recursive: true, force: true }));
  writeFileSync(path.join(stray, 'Actions.svelte.d.ts'), 'export type Props = {};\n');
  const eslint = new ESLint({ cwd: root });
  const reached = [];
  for (const entry of [...ignoredPaths(root), 'var/lint-coverage-stray/Actions.svelte.d.ts']) {
    const probe = entry.endsWith('/') ? `${entry}probe.ts` : entry;
    if (!(await eslint.isPathIgnored(probe))) reached.push(probe);
  }
  assert.deepEqual(reached, []);
});

// The vendored copy of polyspec/kit is the only tracked code that ESLint leaves out: it is linted in polyspec/kit.
test('ESLint ignores the vendored copy of polyspec/kit and no other tracked source', async () => {
  const eslint = new ESLint({ cwd: root });
  assert.equal(await eslint.isPathIgnored('scripts/kit/run-tests.mjs'), true);
  assert.equal(await eslint.isPathIgnored('tests/kit/run-tests.test.mjs'), true);
  assert.equal(await eslint.isPathIgnored('scripts/repository-files.mjs'), false);
  assert.equal(await eslint.isPathIgnored('tests/conformance/run-suite.mjs'), false);
});
