import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { browserPaths, browserServers, expectedBrowserSections } from './browser-report-policy.mjs';
import {
  assertGenerationReportInvariants, expectedGenerationCombinations,
  expectedGenerationRequests, expectedGenerationResults,
} from './check-generation.mjs';
import { assertPersistenceReport, expectedPersistenceResults } from './persistence-report.mjs';
import { pipelineCombinations } from './src/pipeline-flow.mjs';
import { recordServers } from './src/record-contract.mjs';
import { assertSourceIdentity, sameSourceIdentity } from './src/source-identity.mjs';

async function jsonFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function browserCounts(summary) {
  const expected = Object.fromEntries(browserPaths.map(renderingPath => [renderingPath, expectedBrowserSections()]));
  let checks = 0;
  assert.deepEqual(Object.keys(summary.verification ?? {}).sort(),
    Object.keys(expected).sort(), 'Browser rendering paths differ');
  for (const [renderingPath, sections] of Object.entries(expected)) {
    assert.deepEqual(Object.keys(summary.verification[renderingPath] ?? {}).sort(),
      Object.keys(sections).sort(), `${renderingPath}: browser sections differ`);
    for (const [section, total] of Object.entries(sections)) {
      assert.deepEqual(summary.verification[renderingPath][section], { total, failed: 0 },
        `${renderingPath}/${section}: browser total differs`);
      checks += total;
    }
  }
  return checks;
}

/**
 * The canonical flow report: every combination in order and every store reset, each passed, and
 * the aggregate passed with the matching counts.
 */
function verifyPipeline(pipeline, source) {
  assert.ok(sameSourceIdentity(pipeline.source, source), 'Pipeline report source identity differs');
  const expected = pipelineCombinations().map(({ id }) => id);
  assert.ok(Array.isArray(pipeline.combinations) && Array.isArray(pipeline.resets),
    'Pipeline report is incomplete');
  assert.deepEqual(pipeline.combinations.map(result => result.id), expected,
    'Pipeline combinations differ');
  assert.deepEqual(pipeline.resets.map(result => result.id),
    recordServers.map(server => `reset/${server}`), 'Pipeline store resets differ');
  const failed = [...pipeline.resets, ...pipeline.combinations]
    .filter(result => result.status !== 'passed');
  assert.ok(pipeline.passed === true && pipeline.failed === 0 && failed.length === 0,
    `Pipeline report failed: ${failed.map(result => `${result.id} ${result.status}`).join(', ')
      || 'the report is not marked passed'}`);
  assert.equal(pipeline.total, expected.length, 'Pipeline combination total differs');
  assert.equal(pipeline.passedCombinations, expected.length, 'Pipeline pass total differs');
  return { combinations: expected.length };
}

/**
 * Verify the reports of one verification run: every report names the recorded source identity
 * and satisfies every count and pass condition of the form verification contract.
 */
export async function verifyEvidence(resultsDirectory) {
  assert.ok(path.isAbsolute(resultsDirectory), 'The results directory must be absolute');
  const [source, generation, persistence, pipeline, browser] = await Promise.all([
    jsonFile(path.join(resultsDirectory, 'source.json')),
    jsonFile(path.join(resultsDirectory, 'generation.json')),
    jsonFile(path.join(resultsDirectory, 'server-report.json')),
    jsonFile(path.join(resultsDirectory, 'pipeline.json')),
    jsonFile(path.join(resultsDirectory, 'browser-summary.json')),
  ]);
  assertSourceIdentity(source, 'Verification evidence requires the verified source identity');

  assert.ok(sameSourceIdentity(generation.source, source), 'Generation report source identity differs');
  assertGenerationReportInvariants(generation);
  assert.equal(generation.invariants?.passed, true, 'Generation report invariants failed');
  assert.equal(generation.invariants?.results, expectedGenerationResults,
    'Generation result total differs');
  assert.equal(generation.invariants?.requests, expectedGenerationRequests,
    'Generation request total differs');
  assert.equal(generation.invariants?.combinations, expectedGenerationCombinations,
    'Generation combination total differs');
  assert.equal(generation.failed, 0, 'Generation report failed');
  assert.equal(generation.passed, expectedGenerationResults, 'Generation pass total differs');

  assert.ok(sameSourceIdentity(persistence.source, source), 'Persistence report source identity differs');
  assertPersistenceReport(persistence);
  assert.equal(persistence.passed, true, 'Persistence report failed');

  const pipelineEvidence = verifyPipeline(pipeline, source);

  assert.ok(sameSourceIdentity(browser.source, source), 'Browser aggregate source identity differs');
  assert.equal(browser.complete, true, 'Browser aggregate is incomplete');
  assert.equal(browser.passed, true, 'Browser aggregate failed');
  assert.equal(browser.failedChecks, 0, 'Browser aggregate contains failed checks');
  assert.deepEqual(browser.serverRuns?.map(run => run.server), browserServers,
    'Browser server runs differ');
  for (const run of browser.serverRuns) {
    assert.equal(run.complete, true, `${run.server}: browser report is incomplete`);
    assert.equal(run.passed, true, `${run.server}: browser report failed`);
    assert.equal(run.failedChecks, 0, `${run.server}: browser checks failed`);
    assert.ok(Number.isFinite(run.durationMs) && run.durationMs >= 0,
      `${run.server}: browser run duration is missing`);
  }

  return {
    source,
    generation: {
      results: expectedGenerationResults, requests: expectedGenerationRequests,
      combinations: expectedGenerationCombinations,
    },
    persistence: { results: expectedPersistenceResults },
    pipeline: pipelineEvidence,
    browser: { checks: browserCounts(browser), servers: browserServers.length },
  };
}
