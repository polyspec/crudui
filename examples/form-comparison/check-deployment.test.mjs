import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertStableDeployment, containerctlHealthLimits, deploymentCleanupPlan, deploymentCpus,
  deploymentHealth, deploymentHealthBudgetSeconds, deploymentMemory, deploymentStepLimitsMs,
  deploymentVolumes, preserveDeploymentDirectory, readDeploymentAuthority,
  removeRetiredComparisonPaths, renderDeploymentCompose, toolchainImageName,
  toolchainImageReference, shouldReuseDeployment,
} from './comparison-deployment.mjs';

const repositoryRoot = '/Users/example/crudui';
const containerfile = await readFile(new URL('./Containerfile', import.meta.url));
const imageReference = toolchainImageReference(containerfile);

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })));
  return directory;
}

test('names the toolchain image by the Containerfile content alone', () => {
  assert.match(imageReference, /^localhost\/crudui-form-comparison-toolchain:[0-9a-f]{16}$/);
  assert.equal(toolchainImageReference(Buffer.from(containerfile)), imageReference);
  assert.notEqual(toolchainImageReference(Buffer.concat([containerfile, Buffer.from('\n')])),
    imageReference);
});

test('reuses a matching running container and bootstraps only an absent or incompatible one', () => {
  assert.equal(shouldReuseDeployment({ state: 'running', imageReference }, imageReference), true);
  assert.equal(shouldReuseDeployment({ state: 'exited', imageReference }, imageReference), false);
  assert.equal(shouldReuseDeployment({ state: 'running', imageReference: 'other' }, imageReference), false);
  assert.equal(shouldReuseDeployment(undefined, imageReference), false);
});

test('renders one deterministic deployment that mounts the repository read-only', () => {
  const first = renderDeploymentCompose({ repositoryRoot, imageReference });
  assert.equal(renderDeploymentCompose({ repositoryRoot, imageReference }), first);
  assert.match(first, new RegExp(`^    image: ${imageReference}$`, 'm'));
  assert.match(first, /^      containerctl\.domain: crudui\.test$/m);
  const volumes = first.split('\n').filter(line => line.startsWith('      - '))
    .map(line => JSON.parse(line.slice('      - '.length)));
  assert.deepEqual(volumes, [
    `${repositoryRoot}:/workspace/source:ro`,
    'build:/workspace/build',
    'cache:/workspace/cache',
    './data:/data',
    './results:/results',
  ]);
  assert.ok(first.endsWith([
    'volumes:', '  build:', `    name: ${deploymentVolumes.build}`,
    '  cache:', `    name: ${deploymentVolumes.cache}`, '',
  ].join('\n')));
  // Nothing in the definition depends on a commit, an archive or an image digest.
  assert.doesNotMatch(first, /[0-9a-f]{40}|sha256:|metadata|archive/);

  const healthLine = first.split('\n').find(line => line.startsWith('      test: '));
  const healthCommand = JSON.parse(healthLine.slice('      test: '.length));
  assert.deepEqual(healthCommand.slice(0, 2), ['CMD', 'node']);
  assert.doesNotThrow(() => new Function(healthCommand[3]));
  assert.match(healthCommand[3], /\/api\/health/);
  assert.match(first, new RegExp(`^    cpus: "${deploymentCpus}"$`, 'm'));
  assert.match(first, new RegExp(`^    mem_limit: ${deploymentMemory}$`, 'm'));
});

test('waits for health within a budget sized from the measured start', () => {
  const compose = renderDeploymentCompose({ repositoryRoot, imageReference });
  const seconds = key => Number(compose.match(new RegExp(`^      ${key}: (\\d+)s$`, 'm'))?.[1]);
  const [interval, timeout, startPeriod] = ['interval', 'timeout', 'start_period'].map(seconds);
  const retries = Number(compose.match(/^      retries: (\d+)$/m)?.[1]);
  assert.deepEqual({ interval, timeout, retries, startPeriod }, {
    interval: deploymentHealth.intervalSeconds, timeout: deploymentHealth.timeoutSeconds,
    retries: deploymentHealth.retries, startPeriod: deploymentHealth.startPeriodSeconds,
  });

  // containerctl accepts interval and timeout above zero and start_period from zero, each at
  // most 10 minutes, 1 through 100 retries, and a startup budget of at most 30 minutes.
  for (const [name, value] of [['interval', interval], ['timeout', timeout]]) {
    assert.ok(Number.isInteger(value) && value > 0
      && value <= containerctlHealthLimits.maxDurationSeconds,
    `Deployment health ${name} must be whole seconds above zero and at most 10 minutes`);
  }
  assert.ok(Number.isInteger(startPeriod) && startPeriod >= 0
    && startPeriod <= containerctlHealthLimits.maxDurationSeconds,
  'Deployment health start_period must be whole seconds from zero to 10 minutes');
  assert.ok(Number.isInteger(retries) && retries >= containerctlHealthLimits.minRetries
    && retries <= containerctlHealthLimits.maxRetries,
  'Deployment health retries must be within containerctl range 1..100');

  // The measured start answered health 58 seconds after the container started. The budget covers
  // that with margin and stays far below containerctl's 30 minutes, which no step may take.
  const budget = startPeriod + retries * (interval + timeout);
  assert.equal(budget, deploymentHealthBudgetSeconds);
  assert.equal(budget, 360);
  assert.ok(budget < containerctlHealthLimits.maxBudgetSeconds,
    'A whole run never gets one thirty minute timeout');
  assert.equal(deploymentStepLimitsMs['containerctl-up'], (budget + 60) * 1_000,
    'Applying the definition waits the health budget and one minute for containerctl itself');
  for (const [id, limit] of Object.entries(deploymentStepLimitsMs)) {
    assert.ok(Number.isSafeInteger(limit) && limit > 0, `${id} must carry its own timeout`);
  }
});

test('rejects a relative repository root and an image other than the toolchain', () => {
  assert.throws(() => renderDeploymentCompose({ repositoryRoot: 'crudui', imageReference }),
    /absolute path/);
  assert.throws(() => renderDeploymentCompose({ repositoryRoot: '/a:b', imageReference }),
    /without a colon/);
  assert.throws(() => renderDeploymentCompose({
    repositoryRoot, imageReference: 'localhost/crudui-form-comparison:a40f434f4f75',
  }), /toolchain image/);
});

test('selects comparison images that no container uses after deployment', () => {
  const retiredToolchain = `${toolchainImageName}:${'0'.repeat(16)}`;
  const usedToolchain = `${toolchainImageName}:${'1'.repeat(16)}`;
  const retiredCandidate = 'localhost/crudui-form-comparison:a40f434f4f75';
  const plan = deploymentCleanupPlan({
    deployedImageReference: imageReference,
    imageReferences: [imageReference, retiredCandidate, retiredToolchain, usedToolchain,
      'docker.io/library/node:26-trixie-slim', 'localhost/unrelated:1'],
    containers: [
      { id: 'crudui-comparison', imageReference },
      { id: 'diagnostic', imageReference: usedToolchain },
    ],
  });
  assert.deepEqual(plan, { imageReferences: [retiredToolchain, retiredCandidate].sort() });
  assert.throws(() => deploymentCleanupPlan({
    deployedImageReference: retiredCandidate, imageReferences: [], containers: [],
  }), /Deployed comparison image reference is invalid/);
});

test('removes the retired per-commit paths and keeps deployment state', async t => {
  const directory = await temporaryDirectory(t, 'crudui-retired-');
  const comparisonRoot = path.join(directory, '.form-comparison');
  for (const name of ['candidates/abc', 'sources/ordered-json', 'results', 'deployment/data']) {
    await mkdir(path.join(comparisonRoot, name), { recursive: true });
    await writeFile(path.join(comparisonRoot, name, 'file.json'), '{}\n');
  }
  await removeRetiredComparisonPaths(comparisonRoot);
  assert.deepEqual(await readdir(comparisonRoot), ['deployment']);
  assert.equal(await readFile(path.join(comparisonRoot, 'deployment/data/file.json'), 'utf8'), '{}\n');
  await assert.rejects(removeRetiredComparisonPaths(directory), /\.form-comparison directory/);
});

test('rejects any change during identical deployment reapplication', () => {
  const snapshot = {
    container: { id: 'crudui-comparison', createdAt: 'one', startedAt: 'two',
      imageReference, mounts: [{ destination: '/workspace/source' }], readOnlySource: true },
    route: { domain: 'crudui.test', container: 'crudui-comparison' },
    certificate: { fingerprint256: 'AA:BB' },
    source: { commit: 'a'.repeat(40), changes: null },
    files: { data: { 'php-bindForm-react.json': '4'.repeat(64) } },
    responses: { home: '5'.repeat(64), health: '6'.repeat(64),
      source: '7'.repeat(64), data: '8'.repeat(64) },
  };
  assert.doesNotThrow(() => assertStableDeployment(snapshot, structuredClone(snapshot)));
  for (const mutate of [
    value => { value.container.startedAt = 'changed'; },
    value => { value.certificate.fingerprint256 = 'changed'; },
    value => { value.files.data['php-bindForm-react.json'] = 'changed'; },
    value => { value.responses.health = 'changed'; },
    value => { value.source.changes = 'b'.repeat(64); },
  ]) {
    const changed = structuredClone(snapshot);
    mutate(changed);
    assert.throws(() => assertStableDeployment(snapshot, changed), /Deployment changed after identical application/);
  }
});

test('preserves active deployment files without overwriting different data', async t => {
  const directory = await temporaryDirectory(t, 'crudui-preservation-');
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
  const directory = await temporaryDirectory(t, 'crudui-ca-');
  const caPath = path.join(directory, 'ca.crt');
  const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n';
  await writeFile(caPath, certificate);
  const authority = await readDeploymentAuthority({ machine: { caPath } });
  assert.equal(authority.path, caPath);
  assert.equal(authority.ca.toString(), certificate);
  assert.match(authority.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(readDeploymentAuthority({ machine: {} }), /CA path is missing/);
});
