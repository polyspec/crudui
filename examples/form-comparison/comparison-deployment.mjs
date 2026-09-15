import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { browserServers } from './browser-report-policy.mjs';
import { containerRuntime, runContainer } from './container-runtime.mjs';
import { forwardLines } from './src/process-output.mjs';
import { formatDuration, runStep } from './src/step-runner.mjs';
import {
  buildDirectory, cacheDirectory, dataDirectory, resultsDirectory, sourceMount,
} from './src/server-layout.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import { sourceIdentity } from './src/source-tree.mjs';

const execFile = promisify(execFileCallback);
const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(exampleDirectory, '../..');
export const deploymentDomain = 'crudui.test';
export const deploymentContainer = 'crudui-comparison';
const deploymentGroup = 'crudui';
const deploymentService = 'comparison';
const comparisonImagePrefix = 'localhost/crudui-form-comparison';
export const toolchainImageName = `${comparisonImagePrefix}-toolchain`;
export const deploymentVolumes = Object.freeze({
  build: 'crudui-comparison-build', cache: 'crudui-comparison-cache',
});
// Paths of the removed per-commit procedure; deployment removes them.
export const retiredComparisonPaths = Object.freeze(['candidates', 'sources', 'results']);

/** containerctl's limits for one health declaration, in seconds. */
export const containerctlHealthLimits = Object.freeze({
  maxDurationSeconds: 600, minRetries: 1, maxRetries: 100, maxBudgetSeconds: 1800,
});
/**
 * The health budget, sized from the measured start: the first start of empty volumes installed
 * and built everything and answered health 58 seconds after the container started. The start
 * period covers twice that, and the checks that follow six times it, so a slow machine still
 * passes while a stopped build fails in six minutes instead of thirty.
 */
export const deploymentHealth = Object.freeze({
  intervalSeconds: 5, timeoutSeconds: 5, retries: 24, startPeriodSeconds: 120,
});
export const deploymentHealthBudgetSeconds = deploymentHealth.startPeriodSeconds
  + deploymentHealth.retries * (deploymentHealth.intervalSeconds + deploymentHealth.timeoutSeconds);
/** Four browser checks run at the same time, one browser and one API server each. */
export const deploymentCpus = 8;
export const deploymentMemory = '8G';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Name the toolchain image by its Containerfile content, so it changes only with that file. */
export function toolchainImageReference(containerfile) {
  return `${toolchainImageName}:${sha256(containerfile).slice(0, 16)}`;
}

/** Create the Compose definition used by containerctl. */
export function renderDeploymentCompose({ repositoryRoot: root, imageReference }) {
  assert.ok(path.isAbsolute(root) && path.normalize(root) === root && !root.includes(':'),
    'Deployment repository root must be one absolute path without a colon');
  assert.match(imageReference, new RegExp(`^${toolchainImageName}:[0-9a-f]{16}$`),
    'Deployment image must be the toolchain image');
  const healthScript = "fetch('http://127.0.0.1:8080/api/health').then(async response => { const health = await response.json(); "
    + `if (!response.ok || health.status !== 'ok' || JSON.stringify(health.servers) !== ${JSON.stringify(JSON.stringify(browserServers))}) process.exit(1) })`
    + '.catch(() => process.exit(1))';
  const volume = value => `      - ${JSON.stringify(value)}`;
  return [
    'name: crudui',
    '',
    'services:',
    '  comparison:',
    `    image: ${imageReference}`,
    '    expose: ["8080"]',
    `    cpus: "${deploymentCpus}"`,
    `    mem_limit: ${deploymentMemory}`,
    '    volumes:',
    volume(`${root}:${sourceMount}:ro`),
    volume(`build:${buildDirectory}`),
    volume(`cache:${cacheDirectory}`),
    volume(`./data:${dataDirectory}`),
    volume(`./results:${resultsDirectory}`),
    '    labels:',
    `      containerctl.domain: ${deploymentDomain}`,
    '    healthcheck:',
    `      test: ${JSON.stringify(['CMD', 'node', '-e', healthScript])}`,
    // containerctl waits at most start_period + retries × (interval + timeout) and allows 30
    // minutes. This budget is sized from the measured start instead: see deploymentHealth.
    `      interval: ${deploymentHealth.intervalSeconds}s`,
    `      timeout: ${deploymentHealth.timeoutSeconds}s`,
    `      retries: ${deploymentHealth.retries}`,
    `      start_period: ${deploymentHealth.startPeriodSeconds}s`,
    '',
    'volumes:',
    '  build:',
    `    name: ${deploymentVolumes.build}`,
    '  cache:',
    `    name: ${deploymentVolumes.cache}`,
    '',
  ].join('\n');
}

/** Select comparison images that neither the deployment nor any container uses. */
export function deploymentCleanupPlan({ deployedImageReference, imageReferences, containers }) {
  assert.ok(deployedImageReference.startsWith(`${toolchainImageName}:`),
    'Deployed comparison image reference is invalid');
  const used = new Set(containers.map(container => container.imageReference));
  return {
    imageReferences: [...new Set(imageReferences)]
      .filter(reference => /^localhost\/crudui-form-comparison(?:-toolchain)?:/.test(reference)
        && reference !== deployedImageReference && !used.has(reference))
      .sort(),
  };
}

/** Reject state changes after applying the same deployment definition twice. */
export function assertStableDeployment(before, after) {
  try {
    assert.deepEqual(after, before);
  } catch (error) {
    const failure = new Error('Deployment changed after identical application', { cause: error });
    failure.before = before;
    failure.after = after;
    throw failure;
  }
}

async function fileDigests(root) {
  const result = {};
  async function visit(directory, relative = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelative = path.posix.join(relative, entry.name);
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) result[childRelative] = sha256(await readFile(child));
      else throw new Error(`Deployment data contains an unsupported entry: ${childRelative}`);
    }
  }
  await visit(root);
  return result;
}

async function copyDirectory(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destinationPath);
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    } else {
      throw new Error(`Deployment data contains an unsupported entry: ${sourcePath}`);
    }
  }
}

/** Copy existing deployment files without overwriting or changing their bytes. */
export async function preserveDeploymentDirectory(source, destination) {
  const before = await fileDigests(source);
  try {
    const existing = await fileDigests(destination);
    assert.deepEqual(existing, before, 'Existing deployment files differ from the active service');
    return { source: path.resolve(source), destination: path.resolve(destination), files: before };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const staging = await mkdtemp(`${destination}.migration-`);
  try {
    await copyDirectory(source, staging);
    assert.deepEqual(await fileDigests(staging), before,
      'Copied deployment files differ from the active service');
    assert.deepEqual(await fileDigests(source), before,
      'Active deployment files changed during preservation');
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  assert.deepEqual(await fileDigests(destination), before,
    'Preserved deployment files differ from the active service');
  return { source: path.resolve(source), destination: path.resolve(destination), files: before };
}

/** Remove the directories of the removed per-commit procedure from one comparison root. */
export async function removeRetiredComparisonPaths(comparisonRoot) {
  assert.ok(path.isAbsolute(comparisonRoot) && path.basename(comparisonRoot) === '.form-comparison',
    'Comparison root must be an absolute .form-comparison directory');
  for (const name of retiredComparisonPaths) {
    await rm(path.join(comparisonRoot, name), { recursive: true, force: true });
  }
}

/** Load the certificate authority selected by containerctl. */
export async function readDeploymentAuthority(status) {
  const caPath = status?.machine?.caPath;
  assert.ok(path.isAbsolute(caPath ?? ''), 'containerctl CA path is missing');
  const ca = await readFile(caPath);
  assert.match(ca.toString('ascii'), /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/,
    'containerctl CA file is invalid');
  return { path: caPath, ca, sha256: sha256(ca) };
}

async function response(url, ca) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, rejectUnauthorized: true }, value => {
      const chunks = [];
      value.on('data', chunk => chunks.push(chunk));
      value.on('end', () => {
        try {
          assert.equal(value.statusCode, 200, `${url}: HTTP status`);
          const bytes = Buffer.concat(chunks);
          resolve({ bytes, sha256: sha256(bytes) });
        } catch (error) { reject(error); }
      });
      value.on('error', reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error(`${url}: request timed out`)));
    request.on('error', reject);
  });
}

async function certificate(hostname, ca) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname,
      ca, rejectUnauthorized: true });
    socket.setTimeout(10_000);
    socket.once('secureConnect', () => {
      try {
        assert.equal(socket.authorized, true, 'Deployment certificate is not trusted');
        const value = socket.getPeerCertificate();
        assert.match(value.fingerprint256 ?? '', /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/,
          'Deployment certificate fingerprint is invalid');
        resolve({
          fingerprint256: value.fingerprint256, subject: value.subject, issuer: value.issuer,
          subjectAltName: value.subjectaltname, validFrom: value.valid_from, validTo: value.valid_to,
        });
      } catch (error) { reject(error); } finally { socket.end(); }
    });
    socket.once('timeout', () => socket.destroy(new Error('Deployment certificate request timed out')));
    socket.once('error', reject);
  });
}

/**
 * Limits of the deployment's own steps. The image build is measured at its first run on this
 * machine; the application waits the health budget and one minute for containerctl itself.
 */
export const deploymentStepLimitsMs = Object.freeze({
  'toolchain-image': 1_800_000,
  'containerctl-up': (deploymentHealthBudgetSeconds + 60) * 1_000,
});

async function runDeploymentStep(step, options = {}) {
  const result = await runStep({ ...step, timeoutMs: deploymentStepLimitsMs[step.id] },
    { label: 'deployment', ...options });
  assert.equal(result.status, 'passed',
    `${step.id} ${result.status} after ${formatDuration(result.durationMs)}`);
  return result;
}

/**
 * Print the supervisor's build progress while containerctl waits for health. The container
 * writes each build target's start, elapsed time and result, so the wait is never silent.
 */
async function followSupervisor() {
  const runtime = await containerRuntime();
  const child = spawn(runtime.executable, ['logs', '--follow', deploymentContainer], {
    env: { ...process.env, ...runtime.environment }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', () => {});
  for (const stream of [child.stdout, child.stderr]) {
    forwardLines(stream, {
      prefix: '', drop: line => !line.startsWith('[supervisor'),
      write: text => process.stdout.write(text),
    });
  }
  return {
    stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    },
  };
}

async function listContainers() {
  const { stdout } = await runContainer(['list', '--all', '--format', 'json']);
  return JSON.parse(stdout).map(container => ({
    id: container.id, state: container.status?.state ?? '',
    imageReference: container.configuration?.image?.reference ?? '',
    mounts: container.configuration?.mounts ?? [],
  }));
}

async function listImageReferences() {
  const { stdout } = await runContainer(['image', 'list', '--format', 'json']);
  return JSON.parse(stdout).map(image => image.configuration?.name ?? '');
}

/** Build the toolchain image once per Containerfile content; the context holds no source. */
async function ensureToolchainImage(imageReference, containerfile, contextDirectory) {
  if ((await listImageReferences()).includes(imageReference)) return false;
  await rm(contextDirectory, { recursive: true, force: true });
  await mkdir(contextDirectory, { recursive: true });
  const runtime = await containerRuntime();
  await runDeploymentStep({
    id: 'toolchain-image', command: runtime.executable, environment: runtime.environment,
    args: ['build', '--file', containerfile, '--tag', imageReference,
      '--progress', 'plain', contextDirectory],
  });
  return true;
}

function mountState(mount) {
  return {
    destination: mount.destination, source: mount.source,
    type: Object.keys(mount.type ?? {}).sort(), options: [...(mount.options ?? [])].sort(),
  };
}

async function containerState(imageReference, deploymentDirectory) {
  const { stdout } = await runContainer(['inspect', deploymentContainer]);
  const values = JSON.parse(stdout);
  assert.equal(values.length, 1, 'Expected one deployment container');
  const [value] = values;
  const configuration = value.configuration;
  assert.equal(value.status?.state, 'running', 'Deployment container is not running');
  assert.equal(configuration?.image?.reference, imageReference, 'Deployment image differs');
  const mounts = (configuration?.mounts ?? []).map(mountState)
    .sort((left, right) => left.destination.localeCompare(right.destination));
  assert.deepEqual(mounts.map(mount => mount.destination),
    [dataDirectory, resultsDirectory, buildDirectory, cacheDirectory, sourceMount].sort(),
    'Deployment mount destinations differ');
  const bindSources = Object.fromEntries(mounts.map(mount => [mount.destination, mount.source]));
  assert.equal(path.resolve(bindSources[sourceMount]), repositoryRoot, 'Source mount differs');
  assert.equal(path.resolve(bindSources[dataDirectory]), path.join(deploymentDirectory, 'data'),
    'Data mount differs');
  assert.equal(path.resolve(bindSources[resultsDirectory]), path.join(deploymentDirectory, 'results'),
    'Results mount differs');
  // The container must not be able to write the mounted repository.
  await runContainer(['exec', '--user', 'node', deploymentContainer, 'node', '-e',
    `const fs = require('node:fs'); try { fs.accessSync(${JSON.stringify(sourceMount)}, fs.constants.W_OK); process.exit(1) } catch (error) { if (error.code !== 'EROFS') process.exit(1) }`]);
  return {
    id: value.id, createdAt: configuration.creationDate, startedAt: value.status.startedDate,
    imageReference: configuration.image.reference, imageDigest: configuration.image.descriptor?.digest,
    mounts, readOnlySource: true,
  };
}

async function routeState(status, imageReference) {
  const group = status.groups?.find(item => item.name === deploymentGroup);
  assert.ok(group, 'Deployment route group is missing');
  const service = group.services?.find(item => item.name === deploymentService);
  assert.ok(service, 'Deployment route service is missing');
  assert.equal(service.container, deploymentContainer, 'Deployment route container differs');
  assert.equal(service.domain, deploymentDomain, 'Deployment route domain differs');
  assert.equal(service.url, `https://${deploymentDomain}/`, 'Deployment route URL differs');
  assert.equal(service.state, 'running', 'Deployment route service is not running');
  assert.equal(service.routed, true, 'Deployment route is not active');
  assert.equal(service.image, imageReference, 'Deployment route image differs');
  return {
    group: group.name, service: service.name, container: service.container,
    domain: service.domain, url: service.url, image: service.image, port: service.port,
    scheme: service.scheme, state: service.state, routed: service.routed,
  };
}

async function deploymentSnapshot(imageReference, deploymentDirectory) {
  const origin = `https://${deploymentDomain}`;
  const { stdout } = await execFile('containerctl', ['status', '--json'], { encoding: 'utf8' });
  const status = JSON.parse(stdout);
  const authority = await readDeploymentAuthority(status);
  const [home, health, source, data, container, route, tlsCertificate, identity] =
    await Promise.all([
      response(`${origin}/`, authority.ca), response(`${origin}/api/health`, authority.ca),
      response(`${origin}/source.json`, authority.ca),
      response(`${origin}/api/php/load/bindForm/react`, authority.ca),
      containerState(imageReference, deploymentDirectory), routeState(status, imageReference),
      certificate(deploymentDomain, authority.ca), sourceIdentity(repositoryRoot),
    ]);
  assert.deepEqual(JSON.parse(health.bytes), { status: 'ok', servers: browserServers },
    'Deployment health response differs');
  assert.ok(sameSourceIdentity(JSON.parse(source.bytes), identity),
    'The deployment serves a different tree than this checkout');
  assert.equal(JSON.parse(data.bytes)?.server, 'php', 'Deployment data response server differs');
  return {
    container, route, authority: { path: authority.path, sha256: authority.sha256 },
    certificate: tlsCertificate, source: identity,
    files: { data: await fileDigests(path.join(deploymentDirectory, 'data')) },
    responses: { home: home.sha256, health: health.sha256, source: source.sha256, data: data.sha256 },
  };
}

/**
 * Apply the definition. containerctl reports each container start and healthcheck attempt with
 * its elapsed time; from the start of the container this command also prints the supervisor's
 * build progress, so the wait for health shows what runs.
 */
async function containerctl(composeFile) {
  let supervisor = null;
  try {
    await runDeploymentStep({
      id: 'containerctl-up', command: 'containerctl', args: ['-f', composeFile, 'up'],
    }, {
      onLine: line => {
        if (supervisor === null && line.includes(`started container ${deploymentContainer}`)) {
          supervisor = followSupervisor();
        }
      },
    });
  } finally {
    (await supervisor)?.stop();
  }
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node examples/form-comparison/comparison-deployment.mjs');
  const startedClock = performance.now();
  const comparisonRoot = path.join(repositoryRoot, '.form-comparison');
  const deploymentDirectory = path.join(comparisonRoot, 'deployment');
  const containerfile = path.join(exampleDirectory, 'Containerfile');
  const imageReference = toolchainImageReference(await readFile(containerfile));
  const built = await ensureToolchainImage(imageReference, containerfile,
    path.join(comparisonRoot, 'toolchain-context'));

  await mkdir(deploymentDirectory, { recursive: true });
  let preservation = null;
  const active = (await listContainers()).find(container => container.id === deploymentContainer);
  const activeData = active?.mounts.find(mount => mount.destination === dataDirectory)?.source;
  if (activeData) {
    preservation = await preserveDeploymentDirectory(activeData, path.join(deploymentDirectory, 'data'));
  }
  await mkdir(path.join(deploymentDirectory, 'data'), { recursive: true });
  await mkdir(path.join(deploymentDirectory, 'results'), { recursive: true });

  const compose = renderDeploymentCompose({ repositoryRoot, imageReference });
  const composeFile = path.join(deploymentDirectory, 'compose.yaml');
  await writeFile(composeFile, compose);
  await containerctl(composeFile);
  const first = await deploymentSnapshot(imageReference, deploymentDirectory);
  await containerctl(composeFile);
  const second = await deploymentSnapshot(imageReference, deploymentDirectory);
  assertStableDeployment(first, second);

  const cleanup = deploymentCleanupPlan({
    deployedImageReference: imageReference,
    imageReferences: await listImageReferences(), containers: await listContainers(),
  });
  if (cleanup.imageReferences.length > 0) {
    await runContainer(['image', 'delete', ...cleanup.imageReferences]);
  }
  await removeRetiredComparisonPaths(comparisonRoot);
  await rm(path.join(comparisonRoot, 'toolchain-context'), { recursive: true, force: true });
  await rm(path.join(deploymentDirectory, 'deployment.json'), { force: true });
  await writeFile(path.join(deploymentDirectory, 'verification.json'), `${JSON.stringify({
    imageReference, imageBuilt: built, composeSha256: sha256(compose), preservation,
    stable: true, first, second, removedImages: cleanup.imageReferences,
  }, null, 2)}\n`);
  process.stdout.write(`Deployed ${JSON.stringify(first.source)} with ${imageReference} at `
    + `https://${deploymentDomain}/ in ${formatDuration(performance.now() - startedClock)}; `
    + `identical reapplication passed; removed `
    + `${cleanup.imageReferences.length} unused comparison images\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
