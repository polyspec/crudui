import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Cargo's default release strip runs the toolchain's rust-objcopy, which a macOS toolchain may
// ship without libLLVM.dylib; the build then prints a warning after reporting a successful
// binary. Every crate that declares a release profile keeps its artifacts unstripped
// (docs/operations/testing.md).
test('every release profile keeps its artifacts unstripped', async () => {
  const manifests = execFileSync('git', ['ls-files', '*Cargo.toml'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const missing = [];
  for (const manifest of manifests) {
    const text = await readFile(path.join(ROOT, manifest), 'utf8');
    const profile = /^\[profile\.release\]\n((?:(?!\[).*\n?)*)/m.exec(text);
    if (profile && !/^strip = "none"$/m.test(profile[1])) missing.push(manifest);
  }
  assert.deepEqual(missing, [], 'release profiles without strip = "none"');
});
