import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const ignoredDirectories = new Set([
  '.git', '.svelte-kit', 'dist', 'node_modules', 'target', 'vendor',
]);

function viteConfigurationFiles(directory, base = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...viteConfigurationFiles(filename, base));
      }
    } else if (entry.isFile() && /(?:^|\/)vite\.config\.[cm]?[jt]s$/.test(
      path.relative(base, filename).split(path.sep).join('/'),
    )) {
      files.push(path.relative(base, filename));
    }
  }
  return files.sort();
}

test('ES module Vite configurations use native module paths', () => {
  const files = viteConfigurationFiles(root);
  const failures = files.filter((filename) => {
    const source = readFileSync(path.join(root, filename), 'utf8');
    return /^\s*(?:import|export)\s/m.test(source) && /\b__dirname\b/.test(source);
  });
  assert.deepEqual(failures, []);
});

test('Vite configuration discovery does not require Git metadata', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-vite-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'packages/example'), { recursive: true });
  mkdirSync(path.join(directory, 'node_modules/ignored'), { recursive: true });
  writeFileSync(path.join(directory, 'packages/example/vite.config.ts'), 'export default {};\n');
  writeFileSync(path.join(directory, 'node_modules/ignored/vite.config.ts'), 'ignored\n');

  assert.deepEqual(viteConfigurationFiles(directory), ['packages/example/vite.config.ts']);
});

test('cross-check renderer resolves build tools by package name', () => {
  const filename = path.join(root, 'examples/cross-check-console/server/engine.mjs');
  const source = readFileSync(filename, 'utf8');

  assert.match(source, /import\(\s*['"]vite['"]\s*\)/);
  assert.match(source, /import\(\s*['"]@sveltejs\/vite-plugin-svelte['"]\s*\)/);
  assert.doesNotMatch(source, /node_modules/);
});
