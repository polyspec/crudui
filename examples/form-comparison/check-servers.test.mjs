import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPersistenceReport, expectedPersistenceResults, finalizePersistenceReport,
  persistenceCheckIds,
} from './persistence-report.mjs';
import { formRenderingPaths, formServers } from './src/runtime-paths.mjs';

const source = { commit: 'a'.repeat(40), changes: null };

function results() {
  return formServers.flatMap(server => formRenderingPaths.flatMap(renderingPath =>
    persistenceCheckIds.map(id => ({ server, path: renderingPath, id, passed: true }))));
}

test('completes the exact persistence matrix for one source identity', () => {
  const report = finalizePersistenceReport(results(), source, '2026-09-10T00:00:00.000Z');
  assert.equal(report.results.length, expectedPersistenceResults);
  assert.deepEqual(report.source, source);
  assert.equal(report.complete, true);
  assert.equal(report.passed, true);
  assert.equal(report.failedChecks, 0);
  assert.doesNotThrow(() => assertPersistenceReport(report));
});

test('retains a persistence failure in a complete report', () => {
  const values = results();
  values[0].passed = false;
  const report = finalizePersistenceReport(values, source);
  assert.equal(report.complete, true);
  assert.equal(report.passed, false);
  assert.equal(report.failedChecks, 1);
  assert.doesNotThrow(() => assertPersistenceReport(report));
});

test('rejects missing, reordered and non-boolean persistence results', () => {
  for (const change of [
    values => values.pop(),
    values => values.reverse(),
    values => { values[0].passed = 'true'; },
  ]) {
    const values = results();
    change(values);
    const report = finalizePersistenceReport(values, source);
    assert.equal(report.complete, false);
    assert.equal(report.passed, false);
    assert.equal(report.failedChecks >= 1, true);
    assert.throws(() => assertPersistenceReport(report));
  }
});

test('requires a complete source identity in the persistence report', () => {
  for (const identity of [{}, { commit: source.commit },
    { commit: source.commit, changes: 'changed' }, { commit: 'HEAD', changes: null }]) {
    const report = finalizePersistenceReport(results(), identity);
    assert.equal(report.complete, false);
    assert.equal(report.passed, false);
    assert.throws(() => assertPersistenceReport(report), /requires a source identity/);
  }
});
