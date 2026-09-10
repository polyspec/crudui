import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStableDeployment, cleanupDeploymentArtifacts, deploymentCleanupPlan,
  preserveDeploymentDirectory, readDeploymentAuthority, renderDeploymentCompose,
  verifyCandidateEvidence,
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
  assert.ok(!first.includes('./results:/results'));
  assert.match(first, new RegExp(commit));
  const healthLine = first.split('\n').find(line => line.startsWith('      test: '));
  const healthCommand = JSON.parse(healthLine.slice('      test: '.length));
  assert.deepEqual(healthCommand.slice(0, 2), ['CMD', 'node']);
  assert.doesNotThrow(() => new Function(healthCommand[3]));
});

test('selects temporary comparison resources after successful deployment', () => {
  const deployedImageReference = `localhost/crudui-form-comparison:${commit.slice(0, 12)}`;
  const oldImageReference = 'localhost/crudui-form-comparison:111111111111';
  const plan = deploymentCleanupPlan({
    deployedImageReference,
    candidateDirectories: ['/repo/.form-comparison/candidates/current',
      '/repo/.form-comparison/candidates/previous'],
    containers: [
      { id: 'crudui-comparison', state: 'running', imageReference: deployedImageReference },
      { id: 'crudui-form-comparison-current', state: 'running',
        imageReference: deployedImageReference },
      { id: 'crudui-form-comparison-previous', state: 'stopped',
        imageReference: oldImageReference },
      { id: 'unrelated', state: 'running', imageReference: 'docker.io/library/node:26' },
    ],
    imageReferences: [deployedImageReference, oldImageReference, 'docker.io/library/node:26'],
  });
  assert.deepEqual(plan, {
    runningContainerIds: ['crudui-form-comparison-current'],
    containerIds: ['crudui-form-comparison-current', 'crudui-form-comparison-previous'],
    candidateDirectories: ['/repo/.form-comparison/candidates/current',
      '/repo/.form-comparison/candidates/previous'],
    imageReferences: [oldImageReference],
  });
});

test('removes candidate files and comparison resources after successful deployment', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-cleanup-'));
  t.after(() => import('node:fs/promises').then(({ rm }) =>
    rm(directory, { recursive: true, force: true })));
  const candidateRoot = path.join(directory, 'candidates');
  const currentCandidate = path.join(candidateRoot, 'current');
  const previousCandidate = path.join(candidateRoot, 'previous');
  const deploymentResultsDirectory = path.join(directory, 'deployment/results');
  const retiredResultsDirectory = path.join(directory, 'retired/.form-comparison/results');
  for (const target of [currentCandidate, previousCandidate, deploymentResultsDirectory,
    retiredResultsDirectory]) {
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'result.json'), '{}\n');
  }
  const deployedImageReference = `localhost/crudui-form-comparison:${commit.slice(0, 12)}`;
  const oldImageReference = 'localhost/crudui-form-comparison:111111111111';
  const calls = [];
  const plan = await cleanupDeploymentArtifacts({
    deployedImageReference, candidateRoot, deploymentResultsDirectory,
    retiredResultsDirectories: [retiredResultsDirectory],
    resources: {
      candidateDirectories: [currentCandidate, previousCandidate],
      containers: [
        { id: 'crudui-comparison', state: 'running', imageReference: deployedImageReference },
        { id: 'current-candidate', state: 'running', imageReference: deployedImageReference },
        { id: 'previous-candidate', state: 'stopped', imageReference: oldImageReference },
      ],
      imageReferences: [deployedImageReference, oldImageReference],
    },
    runCommand: async (command, args) => { calls.push([command, args]); },
  });
  assert.deepEqual(calls, [
    ['container', ['stop', 'current-candidate']],
    ['container', ['delete', 'current-candidate', 'previous-candidate']],
    ['container', ['image', 'delete', oldImageReference]],
  ]);
  assert.deepEqual(plan.candidateDirectories, [currentCandidate, previousCandidate]);
  await assert.rejects(readFile(currentCandidate), /ENOENT/);
  await assert.rejects(readFile(previousCandidate), /ENOENT/);
  await assert.rejects(readFile(deploymentResultsDirectory), /ENOENT/);
  await assert.rejects(readFile(retiredResultsDirectory), /ENOENT/);
});

test('rejects candidate cleanup outside the candidate directory', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-cleanup-boundary-'));
  t.after(() => import('node:fs/promises').then(({ rm }) =>
    rm(directory, { recursive: true, force: true })));
  const candidateRoot = path.join(directory, 'candidates');
  const outside = path.join(directory, 'outside');
  await mkdir(candidateRoot);
  await mkdir(outside);
  const calls = [];
  await assert.rejects(cleanupDeploymentArtifacts({
    deployedImageReference: `localhost/crudui-form-comparison:${commit.slice(0, 12)}`,
    candidateRoot, deploymentResultsDirectory: path.join(directory, 'results'),
    resources: { candidateDirectories: [outside], containers: [], imageReferences: [] },
    runCommand: async (...args) => { calls.push(args); },
  }), /Candidate cleanup path is invalid/);
  assert.deepEqual(calls, []);
  await writeFile(path.join(outside, 'retained'), 'retained');
  assert.equal(await readFile(path.join(outside, 'retained'), 'utf8'), 'retained');
});

test('rejects deployment results cleanup outside the comparison directory', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-results-boundary-'));
  t.after(() => import('node:fs/promises').then(({ rm }) =>
    rm(directory, { recursive: true, force: true })));
  const candidateRoot = path.join(directory, 'candidates');
  const outside = path.join(directory, 'outside');
  await mkdir(candidateRoot);
  await mkdir(outside);
  const calls = [];
  await assert.rejects(cleanupDeploymentArtifacts({
    deployedImageReference: `localhost/crudui-form-comparison:${commit.slice(0, 12)}`,
    candidateRoot, deploymentResultsDirectory: outside,
    resources: { candidateDirectories: [], containers: [], imageReferences: [] },
    runCommand: async (...args) => { calls.push(args); },
  }), /Deployment results cleanup path is invalid/);
  assert.deepEqual(calls, []);
});

test('rejects any change during identical deployment reapplication', () => {
  const snapshot = {
    container: { id: 'crudui-comparison', createdAt: 'one', startedAt: 'two',
      imageDigest: `sha256:${'3'.repeat(64)}`, mounts: ['/data'] },
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

test('preserves active deployment files without overwriting different data', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-preservation-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const source = path.join(directory, 'source');
  const destination = path.join(directory, 'destination');
  await mkdir(path.join(source, 'nested'), { recursive: true });
  await writeFile(path.join(source, 'record.json'), '{"id":1}\n');
  await writeFile(path.join(source, 'nested/result.json'), '{"passed":true}\n');

  const first = await preserveDeploymentDirectory(source, destination);
  assert.equal(Object.keys(first.files).length, 2);
  assert.equal(await readFile(path.join(destination, 'record.json'), 'utf8'), '{"id":1}\n');
  const second = await preserveDeploymentDirectory(source, destination);
  assert.deepEqual(second.files, first.files);

  await writeFile(path.join(destination, 'record.json'), '{"id":2}\n');
  await assert.rejects(preserveDeploymentDirectory(source, destination),
    /Existing deployment files differ/);
  assert.equal(await readFile(path.join(destination, 'record.json'), 'utf8'), '{"id":2}\n');
});

test('loads the explicit containerctl certificate authority', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-ca-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const caPath = path.join(directory, 'ca.crt');
  const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n';
  await writeFile(caPath, certificate);
  const authority = await readDeploymentAuthority({ machine: { caPath } });
  assert.equal(authority.path, caPath);
  assert.equal(authority.ca.toString(), certificate);
  assert.match(authority.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(readDeploymentAuthority({ machine: {} }), /CA path is missing/);
});
