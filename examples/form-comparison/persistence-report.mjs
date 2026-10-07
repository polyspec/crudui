import assert from 'node:assert/strict';

import { formRenderingPaths, formServers } from './src/runtime-paths.mjs';
import { assertSourceIdentity } from './src/source-identity.mjs';

export const persistenceCheckIds = Object.freeze([
  'multipart/roundtrip',
  'multipart/create-delete-create',
  'multipart/invalid-preserves-file',
  'urlencoded/roundtrip',
  'urlencoded/create-delete-create',
  'urlencoded/invalid-preserves-file',
  'json/roundtrip',
  'json/create-delete-create',
  'json/invalid-preserves-file',
  'physical-record-order',
  'invalid-storage-preserved',
  'unknown-fixture',
  'scalar-field-types',
  'language-collection-type',
  'request-size-limit',
]);
export const expectedPersistenceResults =
  formServers.length * formRenderingPaths.length * persistenceCheckIds.length;

function errorRecord(error) {
  return { name: error.name, message: error.message, stack: error.stack };
}

function assertPersistenceEvidence(results, source) {
  assertSourceIdentity(source, 'Persistence report requires a source identity');
  assert.ok(Array.isArray(results), 'Persistence report results are missing');
  assert.equal(results.length, expectedPersistenceResults,
    `Persistence report must contain exactly ${expectedPersistenceResults} results`);

  let offset = 0;
  for (const server of formServers) {
    for (const renderingPath of formRenderingPaths) {
      const group = results.slice(offset, offset + persistenceCheckIds.length);
      offset += persistenceCheckIds.length;
      assert.deepEqual(group.map(result => result.id), persistenceCheckIds,
        `${server}/${renderingPath}: persistence check IDs or order differ`);
      assert.ok(group.every(result => result.server === server),
        `${server}/${renderingPath}: persistence server differs`);
      assert.ok(group.every(result => result.path === renderingPath),
        `${server}/${renderingPath}: persistence rendering path differs`);
      assert.ok(group.every(result => typeof result.passed === 'boolean'),
        `${server}/${renderingPath}: persistence results must be boolean`);
    }
  }
}

export function finalizePersistenceReport(results, source,
  generatedAt = new Date().toISOString()) {
  let invariants;
  try {
    assertPersistenceEvidence(results, source);
    invariants = { passed: true, results: expectedPersistenceResults };
  } catch (error) {
    invariants = { passed: false, error: errorRecord(error) };
  }
  const failedResults = Array.isArray(results)
    ? results.filter(result => result?.passed === false).length
    : 0;
  const complete = invariants.passed;
  const failedChecks = failedResults + (complete ? 0 : 1);
  return {
    generatedAt, source, complete, passed: complete && failedChecks === 0,
    failedChecks, invariants, results,
  };
}

export function assertPersistenceReport(report) {
  assertPersistenceEvidence(report?.results, report?.source);
  assert.equal(report.complete, true, 'Persistence report is incomplete');
  assert.equal(report.invariants?.passed, true, 'Persistence report invariants failed');
  assert.equal(report.invariants?.results, expectedPersistenceResults,
    'Persistence report result total differs');
  const failedChecks = report.results.filter(result => !result.passed).length;
  assert.equal(report.failedChecks, failedChecks, 'Persistence failed-check total differs');
  assert.equal(report.passed, failedChecks === 0, 'Persistence pass state differs');
  return report;
}
