// `make lint` lints every source of the repository: the TypeScript lint of kit (`make lint-ts`: oxlint with the copied
// .oxlintrc.json over every file that Git does not ignore, knip and API Extractor) and the Svelte rules of ESLint on the
// components of packages/svelte, the one package whose tools still need ESLint, run from its tools project
// packages/svelte/tools with the TypeScript 6 of that project (C14.4). Each lint fails on a planted violation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { makeDryRun } from './make-dry-run.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const svelteWorkspace = path.join(root, 'packages/svelte');
const svelteTools = path.join(svelteWorkspace, 'tools');

test('make lint runs the TypeScript lint of kit and the Svelte lint of packages/svelte', () => {
  const run = makeDryRun(root, 'lint');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\bnode node_modules\/@polyspec\/kit\/dist\/lint-ts\.mjs\b/);
  assert.match(run.stdout, /\bnpm\b.* run lint -w @polyspec\/crudui-generator-svelte\b/);
});

test('oxlint with the copied configuration fails on a planted violation', t => {
  mkdirSync(path.join(root, 'var/tmp'), { recursive: true });
  const directory = mkdtempSync(path.join(root, 'var/tmp/crudui-lint-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'planted.mjs');
  writeFileSync(file, 'export function planted(value) {\n  debugger;\n  return value;\n}\n');
  const run = spawnSync(path.join(root, 'node_modules/.bin/oxlint'), ['-c', '.oxlintrc.json', '--deny-warnings', '--format', 'json', file], { cwd: root, encoding: 'utf8' });
  assert.notEqual(run.status, 0, run.stdout + run.stderr);
  const report = JSON.parse(run.stdout);
  assert.ok(report.diagnostics.some(diagnostic => /no-debugger/.test(diagnostic.code)), run.stdout);
});

test('the Svelte lint fails on a planted raw HTML tag in a component', async () => {
  const { ESLint } = createRequire(path.join(svelteTools, 'package.json'))('eslint');
  const eslint = new ESLint({ cwd: svelteWorkspace, overrideConfigFile: path.join(svelteTools, 'eslint.config.js') });
  const [result] = await eslint.lintText('<script lang="ts">\n  export let html: string;\n</script>\n\n{@html html}\n', { filePath: path.join(svelteWorkspace, 'src/components/Planted.svelte') });
  assert.deepEqual(result.messages.map(message => message.ruleId), ['svelte/no-at-html-tags']);
});
