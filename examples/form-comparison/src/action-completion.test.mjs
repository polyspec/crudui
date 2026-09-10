import assert from 'node:assert/strict';
import test from 'node:test';

import { createActionCompletion } from './action-completion.mjs';

test('connects one named UI operation to its reserved completion', async () => {
  const actions = createActionCompletion();
  const id = actions.next('save');
  const result = actions.completion(id);
  assert.equal(actions.begin('load'), undefined);
  actions.begin('save').complete({ status: 200 });
  assert.deepEqual(await result, { status: 200 });
  await assert.rejects(actions.completion(id), /Unknown action completion/);
});

test('retains completion and failure until the verifier requests the result', async () => {
  const actions = createActionCompletion();
  const completed = actions.next('load');
  actions.begin('load').complete('loaded');
  assert.equal(await actions.completion(completed), 'loaded');

  const failed = actions.next('save');
  actions.begin('save').fail(new Error('save failed'));
  await assert.rejects(actions.completion(failed), /save failed/);
});

test('rejects invalid reservations and duplicate completion waiters', async () => {
  const actions = createActionCompletion();
  assert.throws(() => actions.next(''), /operation name/);
  const id = actions.next('save');
  const first = actions.completion(id);
  await assert.rejects(actions.completion(id), /already has a waiter/);
  actions.begin('save').complete('saved');
  assert.equal(await first, 'saved');
});

test('cancels only a reserved operation', async () => {
  const actions = createActionCompletion();
  const cancelled = actions.next('save');
  assert.equal(actions.cancel(cancelled), true);
  assert.equal(actions.cancel(cancelled), false);
  await assert.rejects(actions.completion(cancelled), /Unknown action completion/);

  const running = actions.next('load');
  const operation = actions.begin('load');
  assert.equal(actions.cancel(running), false);
  operation.complete('loaded');
  assert.equal(await actions.completion(running), 'loaded');
});
