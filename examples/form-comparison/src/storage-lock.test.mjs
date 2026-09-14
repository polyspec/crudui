import assert from 'node:assert/strict';
import test from 'node:test';

import { exclusive } from './storage-lock.mjs';

test('rejects a storage operation while another one runs', async () => {
  let release;
  const first = exclusive(() => new Promise(resolve => { release = resolve; }), 'busy');
  let ran = false;
  await assert.rejects(exclusive(async () => { ran = true; }, 'Storage busy'), /^Error: Storage busy$/);
  assert.equal(ran, false);
  release('first');
  assert.equal(await first, 'first');
  assert.equal(await exclusive(async () => 'after', 'busy'), 'after');
});

test('releases the storage lock when an operation fails', async () => {
  await assert.rejects(exclusive(async () => { throw new Error('save failed'); }, 'busy'), /save failed/);
  assert.equal(await exclusive(async () => 'next', 'busy'), 'next');
});
