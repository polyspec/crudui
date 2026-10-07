import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { failedJobs } from '../../scripts/ci-passed.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const needs = (results) => JSON.stringify(Object.fromEntries(Object.entries(results).map(([id, result]) => [id, { result, outputs: {} }])), null, 2);

test('every needed job that did not succeed is named with its result', () => {
  assert.deepEqual(failedJobs(needs({ a: 'success', b: 'success' })), []);
  assert.deepEqual(failedJobs(needs({ a: 'success', b: 'failure', c: 'cancelled', d: 'skipped' })), ['b: failure', 'c: cancelled', 'd: skipped']);
});

test('RESULTS that is missing, unreadable or names no job is refused', () => {
  assert.throws(() => failedJobs(undefined), /RESULTS must be the JSON of toJSON\(needs\)/);
  assert.throws(() => failedJobs('{'), /RESULTS must be the JSON of toJSON\(needs\)/);
  assert.throws(() => failedJobs('[]'), /RESULTS must be a JSON object of jobs/);
  assert.throws(() => failedJobs('{}'), /RESULTS names no job/);
});

test('make ci-passed exits 0 only when every needed job succeeded', () => {
  const run = (results) => spawnSync('make', ['--no-print-directory', 'ci-passed', `RESULTS=${results}`], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run(needs({ a: 'success', b: 'success' })).status, 0);
  const failed = run(needs({ a: 'success', b: 'skipped' }));
  assert.equal(failed.status, 2, 'make exits 2 when its recipe fails');
  assert.equal(run('{}').status, 2);
});
