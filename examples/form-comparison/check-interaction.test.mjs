import assert from 'node:assert/strict';
import test from 'node:test';

import { interactionCombinations } from './check-interaction.mjs';

test('uses the complete current interaction matrix for each server', () => {
  const combinations = interactionCombinations(['php']);
  assert.equal(combinations.length, 60);
  assert.deepEqual(combinations[0], {
    server: 'php', framework: 'react', path: 'bindForm',
    transport: 'form', action: 'pointer',
  });
  assert.deepEqual(combinations.at(-1), {
    server: 'php', framework: 'svelte', path: 'createForm',
    transport: 'json', action: 'empty-keyboard',
  });
});
