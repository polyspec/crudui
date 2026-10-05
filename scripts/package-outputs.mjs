// The build output of the published workspace packages: the path and SHA-256 digest of every file
// in each package's `dist` directory, in path order. scripts/repeat-build.mjs records it after each
// of two builds, and tests/build/reproducible-build.test.mjs compares the records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGES = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'generator-svelte', 'form-binding'];
export const REPEAT_BUILD_DIRECTORY = path.join(ROOT, 'node_modules/.cache/crudui/repeat-build');

export function buildOutputs() {
  const files = [];
  function visit(directory) {
    assert.ok(lstatSync(directory).isDirectory(), `build output must be a directory: ${path.relative(ROOT, directory)}`);
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = path.resolve(directory, item.name);
      if (item.isDirectory()) {
        visit(file);
      } else {
        assert.ok(item.isFile(), `build output must be a regular file: ${path.relative(ROOT, file)}`);
        files.push({ path: path.relative(ROOT, file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
      }
    }
  }
  for (const name of PACKAGES) {
    const before = files.length;
    visit(path.resolve(ROOT, 'packages', name, 'dist'));
    assert.ok(files.length > before, `${name} dist must contain build outputs`);
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
