import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { promisify } from 'node:util';

import {
  assertGenerationReportInvariants, expectedGenerationCombinations,
  expectedGenerationRequests, expectedGenerationResults,
} from './check-generation.mjs';
import { assertPersistenceReport, expectedPersistenceResults } from './persistence-report.mjs';
import { browserPaths, browserServers, expectedBrowserSections } from './browser-report-policy.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const deploymentDomain = 'crudui.test';
const deploymentContainer = 'crudui-comparison';
const deploymentGroup = 'crudui';
const deploymentService = 'comparison';
const comparisonImagePrefix = 'localhost/crudui-form-comparison:';
const candidateContainerPattern = /^crudui-form-comparison-[0-9a-f]{12}$/;
const candidateImagePattern = /^localhost\/crudui-form-comparison:[0-9a-f]{12}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function jsonFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assertMetadata(value, expected, label) {
  assert.deepEqual(value, expected, `${label} metadata differs from the candidate`);
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

/** Verify the reports created for one immutable candidate directory. */
export async function verifyCandidateEvidence(candidateDirectory, commit) {
  assert.match(commit, commitPattern, 'Candidate commit must contain 40 lowercase hexadecimal characters');
  const [metadata, generation, persistence, browser] = await Promise.all([
    jsonFile(path.join(candidateDirectory, 'context/metadata.json')),
    jsonFile(path.join(candidateDirectory, 'results/generation.json')),
    jsonFile(path.join(candidateDirectory, 'results/server-report.json')),
    jsonFile(path.join(candidateDirectory, 'results/browser-summary.json')),
  ]);
  assert.equal(metadata?.source?.commit, commit, 'Candidate metadata commit differs');

  assertMetadata(generation.metadata, metadata, 'Generation report');
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

  assertMetadata(persistence.metadata, metadata, 'Persistence report');
  assertPersistenceReport(persistence);
  assert.equal(persistence.passed, true, 'Persistence report failed');

  assertMetadata(browser.metadata, metadata, 'Browser aggregate');
  assert.equal(browser.complete, true, 'Browser aggregate is incomplete');
  assert.equal(browser.passed, true, 'Browser aggregate failed');
  assert.equal(browser.performancePassed, true, 'Browser performance failed');
  assert.equal(browser.failedChecks, 0, 'Browser aggregate contains failed checks');
  assert.deepEqual(browser.serverRuns?.map(run => run.server), browserServers,
    'Browser server runs differ');
  for (const run of browser.serverRuns) {
    assert.equal(run.complete, true, `${run.server}: browser report is incomplete`);
    assert.equal(run.passed, true, `${run.server}: browser report failed`);
    assert.equal(run.failedChecks, 0, `${run.server}: browser checks failed`);
    assert.equal(run.performance?.passed, true, `${run.server}: browser performance failed`);
    assert.equal(run.performance?.budgetMs, 900_000, `${run.server}: browser budget differs`);
  }
  const checks = browserCounts(browser);

  return {
    commit, metadata,
    generation: {
      results: expectedGenerationResults, requests: expectedGenerationRequests,
      combinations: expectedGenerationCombinations,
    },
    persistence: { results: expectedPersistenceResults },
    browser: { checks, servers: browserServers.length },
  };
}

/** Create the Compose definition used by containerctl. */
export function renderDeploymentCompose({ commit, imageReference }) {
  assert.match(commit, commitPattern, 'Deployment commit must contain 40 lowercase hexadecimal characters');
  assert.equal(imageReference,
    `localhost/crudui-form-comparison:${commit.slice(0, 12)}`,
    'Deployment image tag must match the candidate commit');
  const healthScript = `const commit=${JSON.stringify(commit)};`
    + "Promise.all([fetch('http://127.0.0.1:8080/api/health').then(async response => [response, await response.json()]), fetch('http://127.0.0.1:8080/metadata.json').then(async response => [response, await response.json()])])"
    + `.then(([[healthResponse, health], [metadataResponse, metadata]]) => { const servers = ${JSON.stringify(browserServers)}; `
    + "if (!healthResponse.ok || !metadataResponse.ok || health.status !== 'ok' || JSON.stringify(health.servers) !== JSON.stringify(servers) || metadata?.source?.commit !== commit) process.exit(1) })"
    + '.catch(() => process.exit(1))';
  const healthCommand = JSON.stringify(['CMD', 'node', '-e', healthScript]);
  return [
    'name: crudui',
    '',
    'services:',
    '  comparison:',
    `    image: ${imageReference}`,
    '    expose: ["8080"]',
    '    cpus: "2"',
    '    mem_limit: 1G',
    '    volumes:',
    '      - ./data:/data',
    '    labels:',
    `      containerctl.domain: ${deploymentDomain}`,
    '    healthcheck:',
    `      test: ${healthCommand}`,
    '      interval: 2s',
    '      timeout: 5s',
    '      retries: 60',
    '      start_period: 2s',
    '',
  ].join('\n');
}

/** Select temporary resources that are not part of the active deployment. */
export function deploymentCleanupPlan({
  deployedImageReference, retiredImageReferences = [], candidateDirectories, containers,
  imageReferences,
}) {
  assert.ok(deployedImageReference.startsWith(comparisonImagePrefix),
    'Deployed comparison image reference is invalid');
  const temporaryContainers = containers.filter(container =>
    container.id !== deploymentContainer
      && candidateContainerPattern.test(container.id)
      && candidateImagePattern.test(container.imageReference));
  return {
    runningContainerIds: temporaryContainers
      .filter(container => container.state === 'running')
      .map(container => container.id).sort(),
    containerIds: temporaryContainers.map(container => container.id).sort(),
    candidateDirectories: [...new Set(candidateDirectories)]
      .filter(directory => commitPattern.test(path.basename(directory))).sort(),
    imageReferences: [...new Set([
      ...imageReferences.filter(reference => candidateImagePattern.test(reference)),
      ...retiredImageReferences,
    ])]
      .filter(reference => reference.startsWith(comparisonImagePrefix)
        && reference !== deployedImageReference)
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

async function run(command, args, options = {}) {
  return execFile(command, args, {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...options,
  });
}

async function inspectImage(imageReference) {
  const { stdout } = await run('container', ['image', 'inspect', imageReference]);
  const values = JSON.parse(stdout);
  assert.equal(values.length, 1, 'Expected one local candidate image');
  const configuration = values[0]?.configuration;
  assert.equal(configuration?.name, imageReference, 'Local image reference differs');
  const digest = configuration?.descriptor?.digest;
  assert.match(digest ?? '', digestPattern, 'Local image digest is invalid');
  return { reference: imageReference, digest };
}

async function directDirectories(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory())
      .map(entry => path.join(root, entry.name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function localComparisonResources(candidateRoot) {
  const [{ stdout: containerOutput }, { stdout: imageOutput }, candidateDirectories] =
    await Promise.all([
      run('container', ['list', '--all', '--format', 'json']),
      run('container', ['image', 'list', '--format', 'json']),
      directDirectories(candidateRoot),
    ]);
  const containers = JSON.parse(containerOutput).map(container => ({
    id: container.id, state: container.status?.state ?? '',
    imageReference: container.configuration?.image?.reference ?? '',
  }));
  const imageReferences = JSON.parse(imageOutput)
    .map(image => image.configuration?.name ?? '');
  return { containers, imageReferences, candidateDirectories };
}

function assertDirectChild(root, directory, message) {
  const relative = path.relative(root, directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && !relative.includes(path.sep), message);
}

async function removeDirectoryWithin(root, directory) {
  assertDirectChild(root, directory, 'Candidate cleanup path is invalid');
  await rm(directory, { recursive: true, force: true });
}

/** Remove candidate resources after the deployed service passes verification. */
export async function cleanupDeploymentArtifacts({
  deployedImageReference, candidateRoot, deploymentResultsDirectory,
  retiredImageReferences = [], retiredResultsDirectories = [], resources, runCommand = run,
}) {
  const plan = deploymentCleanupPlan({
    deployedImageReference, retiredImageReferences, ...resources,
  });
  for (const directory of plan.candidateDirectories) {
    assertDirectChild(candidateRoot, directory, 'Candidate cleanup path is invalid');
  }
  const comparisonRoot = path.dirname(candidateRoot);
  assert.equal(path.resolve(deploymentResultsDirectory),
    path.join(comparisonRoot, 'deployment/results'),
    'Deployment results cleanup path is invalid');
  for (const directory of retiredResultsDirectories) {
    assert.ok(path.isAbsolute(directory)
      && path.basename(directory) === 'results'
      && path.basename(path.dirname(directory)) === '.form-comparison',
    'Retired results cleanup path is invalid');
  }
  if (plan.runningContainerIds.length > 0) {
    await runCommand('container', ['stop', ...plan.runningContainerIds]);
  }
  if (plan.containerIds.length > 0) {
    await runCommand('container', ['delete', ...plan.containerIds]);
  }
  if (plan.imageReferences.length > 0) {
    await runCommand('container', ['image', 'delete', ...plan.imageReferences]);
  }
  await rm(deploymentResultsDirectory, { recursive: true, force: true });
  for (const directory of retiredResultsDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  for (const directory of plan.candidateDirectories) {
    await removeDirectoryWithin(candidateRoot, directory);
  }
  return plan;
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

async function containerState(expectedDigest, deploymentDirectory) {
  const { stdout } = await run('container', ['inspect', deploymentContainer]);
  const values = JSON.parse(stdout);
  assert.equal(values.length, 1, 'Expected one deployment container');
  const value = values[0];
  const configuration = value.configuration;
  assert.equal(value.status?.state, 'running', 'Deployment container is not running');
  assert.equal(configuration?.image?.descriptor?.digest, expectedDigest,
    'Deployment image digest differs');
  const mounts = (configuration?.mounts ?? []).map(mount => ({
    destination: mount.destination, source: path.resolve(mount.source),
  })).sort((left, right) => left.destination.localeCompare(right.destination));
  assert.deepEqual(mounts, [
    { destination: '/data', source: path.join(deploymentDirectory, 'data') },
  ], 'Deployment mounts differ');
  return {
    id: value.id, createdAt: configuration.creationDate, startedAt: value.status.startedDate,
    imageDigest: configuration.image.descriptor.digest, mounts,
  };
}

async function routeState(status) {
  const group = status.groups?.find(item => item.name === deploymentGroup);
  assert.ok(group, 'Deployment route group is missing');
  const service = group.services?.find(item => item.name === deploymentService);
  assert.ok(service, 'Deployment route service is missing');
  assert.equal(service.container, deploymentContainer, 'Deployment route container differs');
  assert.equal(service.domain, deploymentDomain, 'Deployment route domain differs');
  assert.equal(service.url, `https://${deploymentDomain}/`, 'Deployment route URL differs');
  assert.equal(service.state, 'running', 'Deployment route service is not running');
  assert.equal(service.routed, true, 'Deployment route is not active');
  return {
    group: group.name, service: service.name, container: service.container,
    domain: service.domain, url: service.url, image: service.image, port: service.port,
    scheme: service.scheme, state: service.state, routed: service.routed,
  };
}

async function deploymentSnapshot(commit, image, deploymentDirectory) {
  const origin = `https://${deploymentDomain}`;
  const { stdout } = await run('containerctl', ['status', '--json']);
  const status = JSON.parse(stdout);
  const authority = await readDeploymentAuthority(status);
  const [home, health, metadataResponse, dataResponse, container, route, tlsCertificate] =
    await Promise.all([
      response(`${origin}/`, authority.ca), response(`${origin}/api/health`, authority.ca),
      response(`${origin}/metadata.json`, authority.ca),
      response(`${origin}/api/php/load/bindForm/react`, authority.ca),
      containerState(image.digest, deploymentDirectory), routeState(status),
      certificate(deploymentDomain, authority.ca),
    ]);
  const healthValue = JSON.parse(health.bytes);
  assert.deepEqual(healthValue, { status: 'ok', servers: browserServers },
    'Deployment health response differs');
  const metadata = JSON.parse(metadataResponse.bytes);
  assert.equal(metadata?.source?.commit, commit, 'Deployed source commit differs');
  const data = JSON.parse(dataResponse.bytes);
  assert.equal(data?.server, 'php', 'Deployment data response server differs');
  assert.equal(route.image, image.reference, 'Deployment route image differs');

  return {
    container, route, authority: { path: authority.path, sha256: authority.sha256 },
    certificate: tlsCertificate,
    files: { data: await fileDigests(path.join(deploymentDirectory, 'data')) },
    responses: {
      home: home.sha256, health: health.sha256, metadata: metadataResponse.sha256,
      data: dataResponse.sha256,
    },
  };
}

function parseCommit(argv) {
  assert.equal(argv.length, 2,
    'Usage: node comparison-deployment.mjs --commit 40-character-candidate-commit');
  assert.equal(argv[0], '--commit',
    'Usage: node comparison-deployment.mjs --commit 40-character-candidate-commit');
  assert.match(argv[1], commitPattern,
    'Candidate commit must contain 40 lowercase hexadecimal characters');
  return argv[1];
}

async function main() {
  const commit = parseCommit(process.argv.slice(2));
  const { stdout: headOutput } = await run('git', ['rev-parse', 'HEAD']);
  assert.equal(headOutput.trim(), commit, 'Deployment candidate must be the current HEAD');
  const { stdout: status } = await run('git', ['status', '--porcelain']);
  assert.equal(status, '', 'Deployment requires a clean working tree');

  const candidateDirectory = path.join(repositoryRoot, '.form-comparison/candidates', commit);
  const evidence = await verifyCandidateEvidence(candidateDirectory, commit);
  const imageReference = `localhost/crudui-form-comparison:${commit.slice(0, 12)}`;
  const image = await inspectImage(imageReference);
  const deploymentDirectory = path.join(repositoryRoot, '.form-comparison/deployment');
  await mkdir(deploymentDirectory, { recursive: true });
  let preservation = { data: null };
  let retiredImageReferences = [];
  let retiredResultsDirectories = [];
  try {
    const { stdout } = await run('container', ['inspect', deploymentContainer]);
    const current = JSON.parse(stdout)[0];
    const retiredImageReference = current?.configuration?.image?.reference;
    if (retiredImageReference && retiredImageReference !== imageReference) {
      assert.ok(retiredImageReference.startsWith(comparisonImagePrefix),
        'Active deployment image reference is invalid');
      retiredImageReferences = [retiredImageReference];
    }
    const mounts = Object.fromEntries((current?.configuration?.mounts ?? [])
      .map(mount => [mount.destination, mount.source]));
    assert.ok(path.isAbsolute(mounts['/data'] ?? ''), 'Active deployment data mount is missing');
    preservation = {
      data: await preserveDeploymentDirectory(mounts['/data'], path.join(deploymentDirectory, 'data')),
    };
    if (path.isAbsolute(mounts['/results'] ?? '')) {
      retiredResultsDirectories = [mounts['/results']];
    }
  } catch (error) {
    if (!/not found|does not exist|No such/i.test(`${error.stderr ?? ''} ${error.message}`)) throw error;
    await mkdir(path.join(deploymentDirectory, 'data'), { recursive: true });
  }
  const compose = renderDeploymentCompose({ commit, imageReference });
  const composeFile = path.join(deploymentDirectory, 'compose.yaml');
  await writeFile(composeFile, compose);
  await writeFile(path.join(deploymentDirectory, 'deployment.json'),
    `${JSON.stringify({ commit, image, composeSha256: sha256(compose), evidence, preservation }, null, 2)}\n`);

  await run('containerctl', ['-f', composeFile, 'up']);
  const first = await deploymentSnapshot(commit, image, deploymentDirectory);
  await run('containerctl', ['-f', composeFile, 'up']);
  const second = await deploymentSnapshot(commit, image, deploymentDirectory);
  assertStableDeployment(first, second);
  const verification = { commit, image, composeSha256: sha256(compose), stable: true,
    first, second };
  await writeFile(path.join(deploymentDirectory, 'verification.json'),
    `${JSON.stringify(verification, null, 2)}\n`);
  const candidateRoot = path.join(repositoryRoot, '.form-comparison/candidates');
  const cleanup = await cleanupDeploymentArtifacts({
    deployedImageReference: imageReference, candidateRoot,
    deploymentResultsDirectory: path.join(deploymentDirectory, 'results'),
    retiredImageReferences,
    retiredResultsDirectories,
    resources: await localComparisonResources(candidateRoot),
  });
  process.stdout.write(`Deployed ${commit} at https://${deploymentDomain}/; identical reapplication passed; `
    + `removed ${cleanup.containerIds.length} containers, ${cleanup.imageReferences.length} images `
    + `and ${cleanup.candidateDirectories.length} candidate directories\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
