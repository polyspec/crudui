import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('verifies the candidate source archive without buffered pipe input', async () => {
  const source = await readFile(new URL('./Containerfile', import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /input:\s*readFileSync\(['"]\/archives\/source\.tar['"]\)/);
  assert.match(source, /verify-candidate-context\.mjs/);
});
