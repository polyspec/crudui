import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPersistenceReport, expectedPersistenceResults, finalizePersistenceReport,
  persistenceCheckIds,
} from './persistence-report.mjs';
import { formRenderingPaths, formServers } from './src/runtime-paths.mjs';

const metadata = { source: { commit: 'a'.repeat(40), archiveSha256: '1'.repeat(64) } };

function results() {
  return formServers.flatMap(server => formRenderingPaths.flatMap(renderingPath =>
    persistenceCheckIds.map(id => ({ server, path: renderingPath, id, passed: true }))));
}

test('completes the exact persistence matrix for one candidate', () => {
  const report = finalizePersistenceReport(results(), metadata, '2026-09-10T00:00:00.000Z');
  assert.equal(report.results.length, expectedPersistenceResults);
  assert.equal(report.complete, true);
  assert.equal(report.passed, true);
  assert.equal(report.failedChecks, 0);
  assert.doesNotThrow(() => assertPersistenceReport(report));
});

test('retains a persistence failure in a complete report', () => {
  const values = results();
  values[0].passed = false;
  const report = finalizePersistenceReport(values, metadata);
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
    const report = finalizePersistenceReport(values, metadata);
    assert.equal(report.complete, false);
    assert.equal(report.passed, false);
    assert.equal(report.failedChecks >= 1, true);
    assert.throws(() => assertPersistenceReport(report));
  }
});

test('requires the candidate commit in persistence metadata', () => {
  const report = finalizePersistenceReport(results(), {});
  assert.equal(report.complete, false);
  assert.equal(report.passed, false);
  assert.throws(() => assertPersistenceReport(report), /candidate source commit/);
});
