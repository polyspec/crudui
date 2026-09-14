import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanupCandidateArtifacts, compactCandidateEvidence, readCandidateResources,
} from './candidate-artifacts.mjs';
import { containerRuntime, runContainer } from './container-runtime.mjs';
import { verifyCandidateEvidence } from './comparison-deployment.mjs';
import { prepareCandidate } from './prepare.mjs';
import { waitForCandidateReadiness } from './src/candidate-readiness.mjs';
import { formServers } from './src/runtime-paths.mjs';

const commitPattern = /^[0-9a-f]{40}$/;
const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));
const currentRepositoryRoot = path.resolve(exampleDirectory, '../..');
const containerNode = '/usr/local/bin/node';
const containerSource = '/workspace/source';
const containerExample = containerSource + '/examples/form-comparison';
const candidateOrigin = 'http://127.0.0.1:8080';

export function candidatePlan({ repositoryRoot, commit }) {
  assert.ok(path.isAbsolute(repositoryRoot), 'Repository root must be absolute');
  assert.match(commit, commitPattern,
    'Candidate commit must contain 40 lowercase hexadecimal characters');
  const candidateRoot = path.join(repositoryRoot, '.form-comparison/candidates');
  const candidateDirectory = path.join(candidateRoot, commit);
  return {
    repositoryRoot,
    commit,
    candidateRoot,
    candidateDirectory,
    contextDirectory: path.join(candidateDirectory, 'context'),
    dataDirectory: path.join(candidateDirectory, 'data'),
    resultsDirectory: path.join(candidateDirectory, 'results'),
    readinessFile: path.join(candidateDirectory, 'results/candidate-ready.json'),
    imageReference: 'localhost/crudui-form-comparison:' + commit.slice(0, 12),
    containerName: 'crudui-form-comparison-' + commit.slice(0, 12),
  };
}

export function candidateContainerArguments(plan) {
  return [
    'create', '--name', plan.containerName,
    '--cpus', '4', '--memory', '4g', '--shm-size', '1g',
    '--env', 'FORM_COMPARISON_READINESS=file',
    '--env', 'FORM_COMPARISON_READY_FILE=/results/candidate-ready.json',
    '--mount', 'type=bind,source=' + plan.dataDirectory + ',target=/data',
    '--mount', 'type=bind,source=' + plan.resultsDirectory + ',target=/results',
    plan.imageReference,
  ];
}

function containerExec(plan, id, script, args = []) {
  return {
    id,
    args: ['exec', plan.containerName, containerNode,
      containerExample + '/' + script, ...args],
  };
}

export function candidateCheckCommands(plan) {
  const commands = [
    containerExec(plan, 'php-modes', 'test-php-modes.mjs', [
      '/opt/ordered_json.so', '/opt/crudui.so', containerSource,
    ]),
    containerExec(plan, 'generation', 'check-generation.mjs', [
      '--url', candidateOrigin, '--library', containerSource,
      '--report', '/results/generation.json',
    ]),
    containerExec(plan, 'persistence', 'check-servers.mjs'),
    {
      id: 'ordered-json',
      args: ['exec', plan.containerName, containerNode, '--test',
        containerExample + '/src/json.test.mjs'],
    },
  ];
  for (const server of formServers) {
    commands.push(containerExec(plan, 'browser-' + server, 'check.mjs', [
      server, candidateOrigin,
    ]));
  }
  commands.push(containerExec(plan, 'browser-summary', 'check-browser-reports.mjs', [
    '--results', '/results', '--origin', candidateOrigin,
    '--metadata', '/workspace/metadata.json',
    '--report', '/results/browser-summary.json',
  ]));
  return commands;
}

async function spawnContainer(args) {
  const runtime = await containerRuntime();
  const child = spawn(runtime.executable, args, {
    env: { ...process.env, ...runtime.environment },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return { child, completion };
}

async function executeContainer(args, label) {
  const started = await spawnContainer(args);
  const result = await started.completion;
  if (result.code !== 0) {
    throw new Error(label + ' failed: ' + (result.signal ?? result.code ?? 'unknown'));
  }
}

async function cleanup(plan, retainSuccessfulCandidate) {
  const resources = await readCandidateResources({ candidateRoot: plan.candidateRoot });
  await cleanupCandidateArtifacts({
    candidateRoot: plan.candidateRoot,
    retainedCommit: retainSuccessfulCandidate ? plan.commit : null,
    retainedImageReference: retainSuccessfulCandidate ? plan.imageReference : null,
    resources,
  });
}

async function prepare(plan) {
  const result = await prepareCandidate({
    repository: plan.repositoryRoot,
    reference: plan.commit,
    workDirectory: path.join(plan.repositoryRoot, '.form-comparison'),
  });
  assert.equal(result.candidate, plan.candidateDirectory,
    'Prepared candidate directory differs from the candidate plan');
  assert.equal(result.context, plan.contextDirectory,
    'Prepared context directory differs from the candidate plan');
}

async function build(plan) {
  await executeContainer([
    'build', '--tag', plan.imageReference, '--progress', 'plain', plan.contextDirectory,
  ], 'Candidate image construction');
}

async function create(plan) {
  await executeContainer(candidateContainerArguments(plan), 'Candidate container creation');
}

async function waitForReadiness(plan) {
  await waitForCandidateReadiness({
    file: plan.readinessFile,
    expected: { commit: plan.commit, servers: [...formServers] },
    start: () => spawnContainer(['start', '--attach', plan.containerName]),
  });
}

async function runCheck(_plan, command) {
  await executeContainer(command.args, 'Candidate check ' + command.id);
}

async function reportFailure(plan, error) {
  process.stderr.write((error.stack ?? error.message ?? String(error)) + '\n');
  const resources = await readCandidateResources({ candidateRoot: plan.candidateRoot });
  if (!resources.containers.some(container => container.id === plan.containerName)) return;
  const { stdout, stderr } = await runContainer(['logs', plan.containerName]);
  if (stdout) process.stderr.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

const defaultOperations = Object.freeze({
  cleanup,
  prepare,
  build,
  create,
  waitForReadiness,
  runCheck,
  verifyEvidence: plan => verifyCandidateEvidence(plan.candidateDirectory, plan.commit),
  compactEvidence: plan => compactCandidateEvidence({
    candidateRoot: plan.candidateRoot, commit: plan.commit,
  }),
  reportFailure,
});

/** Execute and finalize one complete candidate verification lifecycle. */
export async function verifyCandidate(plan, operations = defaultOperations) {
  try {
    await operations.cleanup(plan, false);
    await operations.prepare(plan);
    await operations.build(plan);
    await operations.create(plan);
    await operations.waitForReadiness(plan);
    for (const command of candidateCheckCommands(plan)) {
      await operations.runCheck(plan, command);
    }
    await operations.verifyEvidence(plan);
    await operations.cleanup(plan, true);
    await operations.compactEvidence(plan);
  } catch (error) {
    try {
      await operations.reportFailure(plan, error);
    } catch (reportError) {
      process.stderr.write('Candidate failure reporting failed: '
        + (reportError.stack ?? reportError) + '\n');
    }
    try {
      await operations.cleanup(plan, false);
    } catch (cleanupError) {
      process.stderr.write('Candidate failure cleanup failed: '
        + (cleanupError.stack ?? cleanupError) + '\n');
    }
    throw error;
  }
}

function parseReference(args) {
  if (args.length !== 2 || args[0] !== '--ref' || !args[1]) {
    throw new Error('Usage: node examples/form-comparison/candidate-verification.mjs --ref commit');
  }
  return args[1];
}

async function main() {
  const repositoryRoot = await realpath(currentRepositoryRoot);
  assert.equal(repositoryRoot, currentRepositoryRoot,
    'Repository path must not contain symbolic links');
  await access(path.join(repositoryRoot, '.git'));
  const plan = candidatePlan({
    repositoryRoot,
    commit: parseReference(process.argv.slice(2)),
  });
  await verifyCandidate(plan);
  process.stdout.write('Candidate verification passed for ' + plan.commit + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write((error.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}
