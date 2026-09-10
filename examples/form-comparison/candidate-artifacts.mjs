import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runContainer } from './container-runtime.mjs';

const commitPattern = /^[0-9a-f]{40}$/;
const comparisonImagePrefix = 'localhost/crudui-form-comparison:';
const candidateContainerPattern = /^crudui-form-comparison-[0-9a-f]{12}$/;
const deploymentEvidenceFiles = Object.freeze([
  'context/metadata.json',
  'results/generation.json',
  'results/server-report.json',
  'results/browser-summary.json',
]);

function assertCandidateRoot(candidateRoot) {
  assert.ok(path.isAbsolute(candidateRoot), 'Candidate root must be an absolute path');
}

function assertDirectChild(root, directory) {
  const relative = path.relative(root, directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && !relative.includes(path.sep), 'Candidate cleanup path is invalid');
}

function isCandidateContainer(container) {
  return candidateContainerPattern.test(container.id)
    && container.imageReference.startsWith(comparisonImagePrefix);
}

export function planCandidateArtifactCleanup({
  candidateRoot, retainedCommit = null, retainedImageReference = null,
  protectedImageReferences = [], resources,
}) {
  assertCandidateRoot(candidateRoot);
  if (retainedCommit !== null) {
    assert.match(retainedCommit, commitPattern,
      'Retained candidate commit must contain 40 lowercase hexadecimal characters');
  }
  if (retainedImageReference !== null) {
    assert.ok(retainedImageReference.startsWith(comparisonImagePrefix),
      'Retained candidate image reference is invalid');
    if (retainedCommit !== null) {
      assert.equal(retainedImageReference,
        comparisonImagePrefix + retainedCommit.slice(0, 12),
        'Retained candidate image reference differs from the commit');
    }
  }
  for (const directory of resources.candidateDirectories) {
    assertDirectChild(candidateRoot, directory);
  }

  const candidateContainers = resources.containers.filter(isCandidateContainer);
  const referencedImages = new Set([
    ...protectedImageReferences,
    ...resources.containers.filter(container => !isCandidateContainer(container))
      .map(container => container.imageReference),
  ]);
  const retainedDirectory = retainedCommit === null
    ? null : path.join(candidateRoot, retainedCommit);

  return {
    runningContainerIds: candidateContainers
      .filter(container => container.state === 'running')
      .map(container => container.id).sort(),
    containerIds: candidateContainers.map(container => container.id).sort(),
    imageReferences: [...new Set(resources.imageReferences)]
      .filter(reference => reference.startsWith(comparisonImagePrefix)
        && reference !== retainedImageReference
        && !referencedImages.has(reference))
      .sort(),
    candidateDirectories: [...new Set(resources.candidateDirectories)]
      .filter(directory => directory !== retainedDirectory).sort(),
  };
}

async function run(command, args) {
  assert.equal(command, 'container', 'Candidate cleanup command must use container');
  return runContainer(args);
}

export async function cleanupCandidateArtifacts({
  candidateRoot, retainedCommit = null, retainedImageReference = null,
  protectedImageReferences = [], resources, runCommand = run,
}) {
  const plan = planCandidateArtifactCleanup({
    candidateRoot, retainedCommit, retainedImageReference,
    protectedImageReferences, resources,
  });
  if (plan.runningContainerIds.length > 0) {
    await runCommand('container', ['stop', ...plan.runningContainerIds]);
  }
  if (plan.containerIds.length > 0) {
    await runCommand('container', ['delete', ...plan.containerIds]);
  }
  if (plan.imageReferences.length > 0) {
    await runCommand('container', ['image', 'delete', ...plan.imageReferences]);
  }
  for (const directory of plan.candidateDirectories) {
    assertDirectChild(candidateRoot, directory);
    await rm(directory, { recursive: true, force: true });
  }
  return plan;
}

export async function readCandidateResources({ candidateRoot, runCommand = run }) {
  assertCandidateRoot(candidateRoot);
  const [{ stdout: containerOutput }, { stdout: imageOutput }, candidateDirectories] =
    await Promise.all([
      runCommand('container', ['list', '--all', '--format', 'json']),
      runCommand('container', ['image', 'list', '--format', 'json']),
      readdir(candidateRoot, { withFileTypes: true })
        .then(entries => entries.filter(entry => entry.isDirectory())
          .map(entry => path.join(candidateRoot, entry.name)).sort())
        .catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error)),
    ]);
  const containers = JSON.parse(containerOutput).map(container => ({
    id: container.id,
    state: container.status?.state ?? '',
    imageReference: container.configuration?.image?.reference ?? '',
  }));
  const imageReferences = JSON.parse(imageOutput)
    .map(image => image.configuration?.name ?? '');
  return { containers, imageReferences, candidateDirectories };
}

export async function compactCandidateEvidence({ candidateRoot, commit }) {
  assertCandidateRoot(candidateRoot);
  assert.match(commit, commitPattern,
    'Candidate commit must contain 40 lowercase hexadecimal characters');
  const candidate = path.join(candidateRoot, commit);
  assertDirectChild(candidateRoot, candidate);
  const contents = new Map(await Promise.all(deploymentEvidenceFiles.map(async relative =>
    [relative, await readFile(path.join(candidate, relative))])));

  await mkdir(candidateRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(candidateRoot, '.compact-'));
  const previous = temporary + '.previous';
  try {
    for (const [relative, value] of contents) {
      const file = path.join(temporary, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, value);
    }
    await rename(candidate, previous);
    try {
      await rename(temporary, candidate);
    } catch (error) {
      await rename(previous, candidate);
      throw error;
    }
    await rm(previous, { recursive: true, force: true });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
