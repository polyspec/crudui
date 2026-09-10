import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCandidateArtifacts, compactCandidateEvidence, planCandidateArtifactCleanup,
  readCandidateResources,
} from './candidate-artifacts.mjs';
import { resolveContainerExecutable } from './container-runtime.mjs';

const currentCommit = 'a'.repeat(40);
const staleCommit = 'b'.repeat(40);
const candidateImage = commit => 'localhost/crudui-form-comparison:' + commit.slice(0, 12);
const candidateContainer = commit => 'crudui-form-comparison-' + commit.slice(0, 12);
const currentImage = candidateImage(currentCommit);
const staleImage = candidateImage(staleCommit);
const deployedImage = 'localhost/crudui-form-comparison:dfe70a6';

function resourceState(candidateRoot) {
  return {
    containers: [
      { id: 'crudui-comparison', state: 'running', imageReference: deployedImage },
      { id: candidateContainer(currentCommit), state: 'running', imageReference: currentImage },
      { id: candidateContainer(staleCommit), state: 'stopped', imageReference: staleImage },
      { id: 'unrelated', state: 'stopped', imageReference: 'localhost/unrelated:test' },
    ],
    imageReferences: [deployedImage, currentImage, staleImage, 'localhost/unrelated:test'],
    candidateDirectories: [
      path.join(candidateRoot, currentCommit),
      path.join(candidateRoot, staleCommit),
    ],
  };
}

function temporary(t, prefix) {
  return mkdtemp(path.join(tmpdir(), prefix)).then(directory => {
    t.after(() => import('node:fs/promises').then(({ rm }) =>
      rm(directory, { recursive: true, force: true })));
    return directory;
  });
}

test('selects every completed candidate artifact and protects deployment state', async t => {
  const root = await temporary(t, 'crudui-candidate-plan-');
  const plan = planCandidateArtifactCleanup({
    candidateRoot: root,
    retainedCommit: currentCommit,
    retainedImageReference: currentImage,
    protectedImageReferences: [deployedImage],
    resources: resourceState(root),
  });

  assert.deepEqual(plan.runningContainerIds, [candidateContainer(currentCommit)]);
  assert.deepEqual(plan.containerIds,
    [candidateContainer(currentCommit), candidateContainer(staleCommit)]);
  assert.deepEqual(plan.imageReferences, [staleImage]);
  assert.deepEqual(plan.candidateDirectories, [path.join(root, staleCommit)]);
});

test('removes failed and stale candidate resources without changing deployment resources', async t => {
  const root = await temporary(t, 'crudui-candidate-cleanup-');
  await mkdir(path.join(root, currentCommit));
  await mkdir(path.join(root, staleCommit));
  const calls = [];
  const plan = await cleanupCandidateArtifacts({
    candidateRoot: root,
    protectedImageReferences: [deployedImage],
    resources: resourceState(root),
    runCommand: async (command, args) => { calls.push([command, args]); },
  });

  assert.deepEqual(calls, [
    ['container', ['stop', candidateContainer(currentCommit)]],
    ['container', ['delete', candidateContainer(currentCommit), candidateContainer(staleCommit)]],
    ['container', ['image', 'delete', currentImage, staleImage]],
  ]);
  assert.deepEqual(plan.imageReferences, [currentImage, staleImage]);
  await assert.rejects(readFile(path.join(root, currentCommit)), /ENOENT/);
  await assert.rejects(readFile(path.join(root, staleCommit)), /ENOENT/);
});

test('retains only the four deployment inputs for a successful candidate', async t => {
  const root = await temporary(t, 'crudui-candidate-compact-');
  const candidate = path.join(root, currentCommit);
  const expected = new Map([
    ['context/metadata.json', '{"source":{"commit":"a"}}\n'],
    ['results/generation.json', '{"passed":290}\n'],
    ['results/server-report.json', '{"passed":true}\n'],
    ['results/browser-summary.json', '{"passed":true}\n'],
  ]);
  for (const [relative, contents] of expected) {
    const file = path.join(candidate, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  await mkdir(path.join(candidate, 'data'));
  await mkdir(path.join(candidate, 'results/screenshots'));
  await writeFile(path.join(candidate, 'context/source.tar'), 'source');
  await writeFile(path.join(candidate, 'data/current.json'), '{}\n');
  await writeFile(path.join(candidate, 'results/php.json'), '{}\n');
  await writeFile(path.join(candidate, 'results/screenshots/failure.png'), 'image');

  await compactCandidateEvidence({ candidateRoot: root, commit: currentCommit });

  assert.deepEqual(await readdir(candidate), ['context', 'results']);
  assert.deepEqual(await readdir(path.join(candidate, 'context')), ['metadata.json']);
  assert.deepEqual(await readdir(path.join(candidate, 'results')),
    ['browser-summary.json', 'generation.json', 'server-report.json']);
  for (const [relative, contents] of expected) {
    assert.equal(await readFile(path.join(candidate, relative), 'utf8'), contents);
  }
});

test('rejects cleanup and compaction outside the candidate root', async t => {
  const root = await temporary(t, 'crudui-candidate-boundary-');
  const outside = await temporary(t, 'crudui-candidate-outside-');
  const calls = [];
  await assert.rejects(cleanupCandidateArtifacts({
    candidateRoot: root,
    resources: { containers: [], imageReferences: [], candidateDirectories: [outside] },
    runCommand: async (...args) => { calls.push(args); },
  }), /Candidate cleanup path is invalid/);
  assert.deepEqual(calls, []);
  await assert.rejects(compactCandidateEvidence({
    candidateRoot: root,
    commit: path.basename(outside),
  }), /Candidate commit must contain 40 lowercase hexadecimal characters/);
});

test('reads candidate resources from container JSON and direct directories', async t => {
  const root = await temporary(t, 'crudui-candidate-resources-');
  await mkdir(path.join(root, currentCommit));
  const calls = [];
  const resources = await readCandidateResources({
    candidateRoot: root,
    runCommand: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === 'list') {
        return { stdout: JSON.stringify([{
          id: candidateContainer(currentCommit),
          status: { state: 'running' },
          configuration: { image: { reference: currentImage } },
        }]) };
      }
      return { stdout: JSON.stringify([{
        configuration: { name: currentImage },
      }]) };
    },
  });
  assert.deepEqual(calls, [
    ['container', ['list', '--all', '--format', 'json']],
    ['container', ['image', 'list', '--format', 'json']],
  ]);
  assert.deepEqual(resources, {
    containers: [{ id: candidateContainer(currentCommit), state: 'running',
      imageReference: currentImage }],
    imageReferences: [currentImage],
    candidateDirectories: [path.join(root, currentCommit)],
  });
});

test('resolves the container executable from explicit, PATH and Homebrew locations', async () => {
  const executableFiles = new Set([
    '/explicit/container', '/path/bin/container', '/brew/bin/brew',
    '/opt/container/bin/container',
  ]);
  const accessFile = async file => {
    if (!executableFiles.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  };
  assert.equal(await resolveContainerExecutable({
    environment: { CONTAINER_BIN: '/explicit/container', PATH: '' }, accessFile,
  }), '/explicit/container');
  assert.equal(await resolveContainerExecutable({
    environment: { PATH: '/path/bin' }, accessFile,
  }), '/path/bin/container');
  assert.equal(await resolveContainerExecutable({
    environment: { PATH: '/brew/bin' }, accessFile,
    execute: async (file, args) => {
      assert.equal(file, '/brew/bin/brew');
      assert.deepEqual(args, ['--prefix', 'container']);
      return { stdout: '/opt/container\n' };
    },
  }), '/opt/container/bin/container');
  await assert.rejects(resolveContainerExecutable({
    environment: { CONTAINER_BIN: 'relative/container', PATH: '' }, accessFile,
  }), /CONTAINER_BIN must contain an absolute path/);
});
