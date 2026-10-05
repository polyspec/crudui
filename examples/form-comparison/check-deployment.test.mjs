import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as deployment from './comparison-deployment.mjs';
import {
  assertStableDeployment, deploymentCleanupPlan, deploymentCpus, deploymentMemory,
  deploymentVolumes, preserveDeploymentDirectory, readDeploymentAuthority,
  removeRetiredComparisonPaths, renderDeploymentCompose, toolchainImageName,
  toolchainImageReference, shouldReuseDeployment,
  buildReadinessCommand,
} from './comparison-deployment.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
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

test('reuses a matching running and routed container and bootstraps only an absent or incompatible one', () => {
  // The route containerctl reports for the service: reuse needs the declared domain routed.
  const route = { routed: true, domains: ['crudui.test'] };
  const running = { state: 'running', imageReference };
  assert.equal(shouldReuseDeployment(running, imageReference, route), true);
  assert.equal(shouldReuseDeployment({ state: 'exited', imageReference }, imageReference, route), false);
  assert.equal(shouldReuseDeployment({ state: 'running', imageReference: 'other' }, imageReference, route), false);
  assert.equal(shouldReuseDeployment(undefined, imageReference, route), false);
  // A definition whose route containerctl has not applied is applied again.
  assert.equal(shouldReuseDeployment(running, imageReference, { routed: false, domains: ['crudui.test'] }), false);
  assert.equal(shouldReuseDeployment(running, imageReference, { routed: true, domains: ['other.test'] }), false);
  assert.equal(shouldReuseDeployment(running, imageReference, undefined), false);
});

test('renders one deterministic deployment that mounts the repository read-only', () => {
  const first = renderDeploymentCompose({ repositoryRoot, imageReference });
  assert.equal(renderDeploymentCompose({ repositoryRoot, imageReference }), first);
  assert.match(first, new RegExp(`^    image: ${imageReference}$`, 'm'));
  // containerctl routes a service only to the domains it lists under x-containerctl.domains.
  assert.match(first, /^ {4}x-containerctl:\n {6}domains: \["crudui\.test"\]$/m);
  assert.doesNotMatch(first, /containerctl\.domain:/);
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

  assert.match(first, new RegExp(`^    cpus: "${deploymentCpus}"$`, 'm'));
  assert.match(first, new RegExp(`^    mem_limit: ${deploymentMemory}$`, 'm'));
});

test('declares no healthcheck, whose budget would bound the first build', () => {
  // containerctl waits for a declared health within start_period + retries × (interval + timeout);
  // the first start builds everything, so the deployment waits for the build state instead.
  const compose = renderDeploymentCompose({ repositoryRoot, imageReference });
  assert.doesNotMatch(compose, /healthcheck|start_period|retries/);
  for (const name of ['containerctlHealthLimits', 'deploymentHealth', 'deploymentHealthBudgetSeconds', 'deploymentStepLimitsMs']) {
    assert.equal(deployment[name], undefined, `${name} is not declared`);
  }
});

test('rejects a relative repository root and an image other than the toolchain', () => {
  assert.throws(() => renderDeploymentCompose({ repositoryRoot: 'crudui', imageReference }),
    /absolute path/);
  assert.throws(() => renderDeploymentCompose({ repositoryRoot: '/a:b', imageReference }),
    /without a colon/);
  assert.throws(() => renderDeploymentCompose({
    repositoryRoot, imageReference: 'localhost/crudui-form-comparison:candidate',
  }), /toolchain image/);
});

test('selects comparison images that no container uses after deployment', () => {
  const retiredToolchain = `${toolchainImageName}:${'0'.repeat(16)}`;
  const usedToolchain = `${toolchainImageName}:${'1'.repeat(16)}`;
  const retiredCandidate = 'localhost/crudui-form-comparison:candidate';
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

test('removes the retired per-commit paths and keeps deployment state and the host checkout', async t => {
  const directory = await temporaryDirectory(t, 'crudui-retired-');
  const comparisonRoot = path.join(directory, '.form-comparison');
  // The host's OrderedJSON checkout under sources/ is what the local record servers build from.
  for (const name of ['candidates/abc', 'sources/ordered-json', 'results', 'deployment/data']) {
    await mkdir(path.join(comparisonRoot, name), { recursive: true });
    await writeFile(path.join(comparisonRoot, name, 'file.json'), '{}\n');
  }
  await removeRetiredComparisonPaths(comparisonRoot);
  assert.deepEqual((await readdir(comparisonRoot)).sort(), ['deployment', 'sources']);
  assert.equal(await readFile(path.join(comparisonRoot, 'sources/ordered-json/file.json'), 'utf8'), '{}\n');
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

test('deployment waits inside the container for the build of this checkout, from the source mount', () => {
  assert.deepEqual(buildReadinessCommand('crudui-comparison', { commit: 'abc', changes: null }), [
    'exec', '--user', 'node', '--env', 'HOME=/home/node', 'crudui-comparison',
    'node', '/workspace/source/examples/form-comparison/ready-build.mjs', '{"commit":"abc","changes":null}',
  ]);
});
