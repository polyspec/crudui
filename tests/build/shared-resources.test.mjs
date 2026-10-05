import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** The recipe lines of one Makefile target, up to the next target. */
function recipe(target) {
  const lines = read('Makefile').split('\n');
  const start = lines.findIndex(line => line.startsWith(`${target}:`));
  assert.ok(start >= 0, `Makefile has no target ${target}`);
  const end = lines.findIndex((line, index) => index > start && /^[A-Za-z0-9_.-]+:/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

test('no Makefile recipe writes to a fixed path under /tmp', () => {
  const fixed = read('Makefile').split('\n').map((line, index) => `Makefile:${index + 1}: ${line.trim()}`)
    .filter(line => /(?:^|[\s'"=(])\/tmp\/[A-Za-z0-9]/.test(line));
  assert.deepEqual(fixed, [], 'Two runs would share these paths; create a directory per run with mktemp');
});

test('docs-verify-idempotent compares the two runs in a directory of its own run', () => {
  const lines = recipe('docs-verify-idempotent');
  assert.match(lines, /mktemp -d/);
  assert.match(lines, /trap 'rm -rf "\$\$runs"' EXIT/);
});
