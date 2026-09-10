import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('ES module Vite configurations use native module paths', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((filename) => /(?:^|\/)vite\.config\.[cm]?[jt]s$/.test(filename));
  const failures = files.filter((filename) => {
    const source = readFileSync(path.join(root, filename), 'utf8');
    return /^\s*(?:import|export)\s/m.test(source) && /\b__dirname\b/.test(source);
  });
  assert.deepEqual(failures, []);
});
