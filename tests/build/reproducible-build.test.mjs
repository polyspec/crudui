import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'generator-svelte'];

function outputs() {
  const files = [];
  function visit(directory) {
    assert.ok(lstatSync(directory).isDirectory(), `build output must be a directory: ${relative(root, directory)}`);
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) {
        visit(path);
      } else {
        assert.ok(item.isFile(), `build output must be a regular file: ${relative(root, path)}`);
        files.push({
          path: relative(root, path),
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        });
      }
    }
  }
  for (const name of packages) {
    const before = files.length;
    visit(resolve(root, 'packages', name, 'dist'));
    assert.ok(files.length > before, `${name} dist must contain build outputs`);
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

test('two official builds produce identical package output bytes', () => {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  const first = outputs();
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  assert.deepEqual(outputs(), first);
});
