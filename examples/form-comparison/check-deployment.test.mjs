import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStableDeployment, renderDeploymentCompose, verifyCandidateEvidence,
} from './deployment.mjs';
import {
  expectedGenerationCombinations, expectedGenerationRequests, expectedGenerationResults,
  finalizeGenerationReport, generationFrameworks, generationRenderingPaths, generationServers,
} from './check-generation.mjs';
import { finalizePersistenceReport, persistenceCheckIds } from './persistence-report.mjs';

const commit = 'a'.repeat(40);
const metadata = {
  source: { commit, archiveSha256: '1'.repeat(64) },
  orderedJson: { commit: 'b'.repeat(40) },
};
const generationCheckIds = [
  'load-current-record', 'compile-reference', 'reject-missing-reference',
  'render-and-inject/nested-order', 'render-and-inject/explicit-empty',
  'render-and-inject/default-rows', 'render-and-inject/stored-en',
  'render-and-inject/stored-ko', 'ssr/en', 'ssr/ko',
  'reject-invalid-render-data', 'stored-record-unchanged',
];

function generationReport() {
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
    frameworks: generationFrameworks, metadata, results,
    requests: Array.from({ length: expectedGenerationRequests }, () => ({})),
  }, '2026-09-10T00:01:00.000Z');
}

function serverReport() {
  const results = generationServers.flatMap(server => generationRenderingPaths.flatMap(renderingPath =>
    persistenceCheckIds.map(id => ({ server, path: renderingPath, id, passed: true }))));
  return finalizePersistenceReport(results, metadata, '2026-09-10T00:02:00.000Z');
}

function browserSummary() {
  const sections = {
    scenarios: { total: 480, failed: 0 }, interactions: { total: 120, failed: 0 },
    mounts: { total: 12, failed: 0 }, documents: { total: 12, failed: 0 },
  };
  return {
    generatedAt: '2026-09-10T00:03:00.000Z', metadata, complete: true, passed: true,
    performancePassed: true, failedChecks: 0,
    verification: { bindForm: structuredClone(sections), createForm: structuredClone(sections) },
    serverRuns: generationServers.map(server => ({
      server, complete: true, passed: true, failedChecks: 0,
      performance: { durationMs: 100, budgetMs: 900_000, passed: true },
    })),
  };
}

async function evidenceFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-deployment-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })));
  await mkdir(path.join(directory, 'context'));
  await mkdir(path.join(directory, 'results'));
  await writeFile(path.join(directory, 'context/metadata.json'), JSON.stringify(metadata));
  await writeFile(path.join(directory, 'results/generation.json'), JSON.stringify(generationReport()));
  await writeFile(path.join(directory, 'results/server-report.json'), JSON.stringify(serverReport()));
  await writeFile(path.join(directory, 'results/browser-summary.json'), JSON.stringify(browserSummary()));
  return directory;
}

test('accepts complete candidate evidence for one exact commit', async t => {
  const directory = await evidenceFixture(t);
  const result = await verifyCandidateEvidence(directory, commit);
  assert.equal(result.commit, commit);
  assert.equal(result.generation.results, expectedGenerationResults);
  assert.equal(result.generation.requests, expectedGenerationRequests);
  assert.equal(result.generation.combinations, expectedGenerationCombinations);
  assert.equal(result.persistence.results, 120);
  assert.equal(result.browser.checks, 1_248);
});

test('rejects failed, incomplete and stale candidate evidence', async t => {
  const directory = await evidenceFixture(t);
  const reportPath = path.join(directory, 'results/server-report.json');
  const failed = serverReport();
  failed.results[0].passed = false;
  failed.passed = false;
  failed.failedChecks = 1;
  await writeFile(reportPath, JSON.stringify(failed));
  await assert.rejects(verifyCandidateEvidence(directory, commit), /Persistence report failed/);

  await writeFile(reportPath, JSON.stringify(serverReport()));
  await assert.rejects(verifyCandidateEvidence(directory, 'c'.repeat(40)), /Candidate metadata commit differs/);
});

test('renders one deterministic deployment definition for the verified image', () => {
  const imageReference = `localhost/crudui-form-comparison:${commit.slice(0, 12)}`;
  const first = renderDeploymentCompose({ commit, imageReference });
  const second = renderDeploymentCompose({ commit, imageReference });
  assert.equal(first, second);
  assert.match(first, new RegExp(`image: ${imageReference}`));
  assert.match(first, /containerctl\.domain: crudui\.test/);
  assert.ok(first.includes('./data:/data'));
  assert.ok(first.includes('./results:/results'));
  assert.match(first, new RegExp(commit));
  const healthLine = first.split('\n').find(line => line.startsWith('      test: '));
  const healthCommand = JSON.parse(healthLine.slice('      test: '.length));
  assert.deepEqual(healthCommand.slice(0, 2), ['CMD', 'node']);
  assert.doesNotThrow(() => new Function(healthCommand[3]));
});

test('rejects any change during identical deployment reapplication', () => {
  const snapshot = {
    container: { id: 'crudui-comparison', createdAt: 'one', startedAt: 'two',
      imageDigest: `sha256:${'3'.repeat(64)}`, mounts: ['/data', '/results'] },
    route: { domain: 'crudui.test', target: 'crudui-comparison' },
    certificate: { fingerprint256: 'AA:BB' },
    files: { 'php-bindForm-react.json': '4'.repeat(64) },
    responses: { home: '5'.repeat(64), health: '6'.repeat(64),
      metadata: '7'.repeat(64), data: '8'.repeat(64) },
  };
  assert.doesNotThrow(() => assertStableDeployment(snapshot, structuredClone(snapshot)));
  for (const mutate of [
    value => { value.container.startedAt = 'changed'; },
    value => { value.certificate.fingerprint256 = 'changed'; },
    value => { value.files['php-bindForm-react.json'] = 'changed'; },
    value => { value.responses.health = 'changed'; },
  ]) {
    const changed = structuredClone(snapshot);
    mutate(changed);
    assert.throws(() => assertStableDeployment(snapshot, changed), /Deployment changed after identical application/);
  }
});
