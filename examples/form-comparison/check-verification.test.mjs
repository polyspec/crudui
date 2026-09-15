import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { expectedBrowserSections } from './browser-report-policy.mjs';
import {
  expectedGenerationCombinations, expectedGenerationRequests, expectedGenerationResults,
  finalizeGenerationReport, generationFrameworks, generationRenderingPaths, generationServers,
} from './check-generation.mjs';
import { finalizePersistenceReport, persistenceCheckIds } from './persistence-report.mjs';
import { verificationCommand, verificationLimitMs } from './verification.mjs';
import { verifyEvidence } from './verification-evidence.mjs';
import { buildReadinessLimitMs, verificationChecks, verificationStages } from './verify-tree.mjs';

const source = { commit: 'a'.repeat(40), changes: 'c'.repeat(64) };
const generationCheckIds = [
  'load-current-record', 'compile-reference', 'reject-missing-reference',
  'render-and-inject/nested-order', 'render-and-inject/explicit-empty',
  'render-and-inject/default-rows', 'render-and-inject/stored-en',
  'render-and-inject/stored-ko', 'frame-document', 'ssr/en', 'ssr/ko', 'reject-ssr-request',
  'reject-invalid-render-data', 'stored-record-unchanged',
];

function generationReport(identity = source) {
  const templateHash = '2'.repeat(64);
  const results = generationServers.flatMap(server => generationRenderingPaths.flatMap(renderingPath =>
    generationFrameworks.flatMap(framework => generationCheckIds.map(id => {
      let evidence;
      if (id === 'compile-reference') {
        evidence = { serializedTemplateSha256: templateHash,
          referenceReads: server === 'go' || server === 'rust' ? 1 : null };
      } else if (id === 'reject-missing-reference') {
        evidence = { retainedTemplateSha256: templateHash };
      } else if (id.startsWith('render-and-inject/')) {
        evidence = { afterRejectedCompile: true, serializedTemplateSha256: templateHash };
      }
      return { server, path: renderingPath, framework, id, passed: true, evidence };
    }))));
  results.push(
    { server: 'shared', path: 'all', framework: 'all', id: 'library-and-source', passed: true },
    { server: 'shared', path: 'all', framework: 'all', id: 'unchanged-library-inputs', passed: true },
  );
  return finalizeGenerationReport({
    servers: generationServers, renderingPaths: generationRenderingPaths,
    frameworks: generationFrameworks, source: identity, results,
    requests: Array.from({ length: expectedGenerationRequests }, () => ({})),
  }, '2026-09-10T00:01:00.000Z');
}

function serverReport() {
  const results = generationServers.flatMap(server => generationRenderingPaths.flatMap(renderingPath =>
    persistenceCheckIds.map(id => ({ server, path: renderingPath, id, passed: true }))));
  return finalizePersistenceReport(results, source, '2026-09-10T00:02:00.000Z');
}

function browserSummary() {
  const sections = Object.fromEntries(Object.entries(expectedBrowserSections())
    .map(([section, total]) => [section, { total, failed: 0 }]));
  return {
    generatedAt: '2026-09-10T00:03:00.000Z', source, complete: true, passed: true,
    performancePassed: true, failedChecks: 0,
    verification: { bindForm: structuredClone(sections), createForm: structuredClone(sections) },
    serverRuns: generationServers.map(server => ({
      server, complete: true, passed: true, failedChecks: 0,
      performance: { durationMs: 100, budgetMs: 900_000, passed: true },
    })),
  };
}

async function evidenceFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-verification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'source.json'), JSON.stringify(source));
  await writeFile(path.join(directory, 'generation.json'), JSON.stringify(generationReport()));
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(serverReport()));
  await writeFile(path.join(directory, 'browser-summary.json'), JSON.stringify(browserSummary()));
  return directory;
}

test('verifies the deployed services alone, without repeating host tests', () => {
  const stages = verificationStages();
  assert.deepEqual(stages.map(stage => stage.map(step => step.id)), [
    ['php-modes'], ['generation'], ['persistence'],
    ['browser-php', 'browser-php-ext', 'browser-go', 'browser-rust'],
    ['browser-summary'],
  ]);
  const checks = verificationChecks();
  // The source suite, the Go and Rust server tests and the ordered JSON tests read no build
  // output of this container; the host and CI run them before a deployment.
  assert.doesNotMatch(JSON.stringify(checks),
    /test:form-comparison|source-suite|server-tests|"npm"|"cargo"|json\.test\.mjs/);
  for (const check of checks) {
    assert.ok(check.cwd.startsWith('/workspace/build/tree'), `${check.id}: ${check.cwd}`);
    assert.ok(Number.isSafeInteger(check.timeoutMs) && check.timeoutMs > 0,
      `${check.id} must carry its own timeout`);
    assert.ok(check.timeoutMs <= 1_200_000, `${check.id}: no step gets a run-length timeout`);
  }
  const byId = Object.fromEntries(checks.map(check => [check.id, check]));
  assert.deepEqual(byId['php-modes'].args, ['test-php-modes.mjs',
    '/workspace/build/tree/.form-comparison/sources/ordered-json/php-extension/src/modules/ordered_json.so',
    '/workspace/build/tree/packages/php-ext/modules/crudui.so', '/workspace/build/tree']);
  assert.deepEqual(byId.generation.args, ['check-generation.mjs', '--url', 'http://127.0.0.1:8080',
    '--library', '/workspace/build/tree', '--report', '/results/generation.json']);
  assert.deepEqual(byId['browser-php'].args, ['check.mjs', 'php', 'http://127.0.0.1:8080']);
  assert.deepEqual(byId['browser-summary'].args, ['check-browser-reports.mjs',
    '--results', '/results', '--origin', 'http://127.0.0.1:8080',
    '--source', '/results/source.json', '--report', '/results/browser-summary.json']);
  assert.doesNotMatch(JSON.stringify(checks), /\/workspace\/source|\/opt\/|archive|metadata/);
});

test('runs verification inside the comparison container as the application user', () => {
  assert.deepEqual(verificationCommand('crudui-comparison'), [
    'exec', '--user', 'node', '--env', 'HOME=/home/node', 'crudui-comparison',
    'node', '/workspace/build/tree/examples/form-comparison/verify-tree.mjs',
  ]);
});

test('waits exactly as long as the checks inside the container may take', () => {
  const stages = verificationStages()
    .reduce((sum, stage) => sum + Math.max(...stage.map(step => step.timeoutMs)), 0);
  assert.equal(verificationLimitMs(), 2 * buildReadinessLimitMs + stages + 60_000);
  // The four browser checks of one stage run at the same time, so the stage costs one of them.
  assert.equal(stages, 60_000 + 120_000 + 60_000 + 1_200_000 + 120_000);
});

test('accepts complete evidence for one source identity', async t => {
  const result = await verifyEvidence(await evidenceFixture(t));
  assert.deepEqual(result.source, source);
  assert.deepEqual(result.generation, {
    results: expectedGenerationResults, requests: expectedGenerationRequests,
    combinations: expectedGenerationCombinations,
  });
  assert.equal(result.persistence.results, 120);
  assert.equal(result.browser.checks,
    2 * Object.values(expectedBrowserSections()).reduce((sum, total) => sum + total, 0));
});

test('rejects failed evidence and evidence for another tree', async t => {
  const directory = await evidenceFixture(t);
  const failed = serverReport();
  failed.results[0].passed = false;
  failed.passed = false;
  failed.failedChecks = 1;
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(failed));
  await assert.rejects(verifyEvidence(directory), /Persistence report failed/);
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(serverReport()));

  await writeFile(path.join(directory, 'generation.json'),
    JSON.stringify(generationReport({ commit: source.commit, changes: null })));
  await assert.rejects(verifyEvidence(directory), /Generation report source identity differs/);
  await writeFile(path.join(directory, 'generation.json'), JSON.stringify(generationReport()));

  await writeFile(path.join(directory, 'source.json'), JSON.stringify({ commit: source.commit }));
  await assert.rejects(verifyEvidence(directory), /requires the verified source identity/);
  await rm(path.join(directory, 'source.json'));
  await assert.rejects(verifyEvidence(directory), /ENOENT/);
});
