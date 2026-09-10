import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  candidateCheckCommands, candidateContainerArguments, candidatePlan,
  verifyCandidate,
} from './candidate-verification.mjs';

const commit = 'a'.repeat(40);
const repositoryRoot = '/repository';

test('defines one commit-specific candidate without a published host port', () => {
  const plan = candidatePlan({ repositoryRoot, commit });
  assert.deepEqual(plan, {
    repositoryRoot,
    commit,
    candidateRoot: '/repository/.form-comparison/candidates',
    candidateDirectory: '/repository/.form-comparison/candidates/' + commit,
    contextDirectory: '/repository/.form-comparison/candidates/' + commit + '/context',
    dataDirectory: '/repository/.form-comparison/candidates/' + commit + '/data',
    resultsDirectory: '/repository/.form-comparison/candidates/' + commit + '/results',
    readinessFile: '/repository/.form-comparison/candidates/' + commit
      + '/results/candidate-ready.json',
    imageReference: 'localhost/crudui-form-comparison:' + commit.slice(0, 12),
    containerName: 'crudui-form-comparison-' + commit.slice(0, 12),
  });
  const args = candidateContainerArguments(plan);
  assert.deepEqual(args, [
    'create', '--name', plan.containerName,
    '--cpus', '4', '--memory', '4g', '--shm-size', '1g',
    '--env', 'FORM_COMPARISON_READY_FILE=/results/candidate-ready.json',
    '--mount', 'type=bind,source=' + plan.dataDirectory + ',target=/data',
    '--mount', 'type=bind,source=' + plan.resultsDirectory + ',target=/results',
    plan.imageReference,
  ]);
  assert.equal(args.includes('--publish'), false);
});

test('runs every candidate check from the committed container source in order', () => {
  const plan = candidatePlan({ repositoryRoot, commit });
  const commands = candidateCheckCommands(plan);
  assert.equal(commands.length, 9);
  assert.deepEqual(commands.map(command => command.id), [
    'php-modes', 'generation', 'persistence', 'ordered-json',
    'browser-php', 'browser-php-ext', 'browser-go', 'browser-rust',
    'browser-summary',
  ]);
  for (const command of commands) {
    assert.equal(command.args[0], 'exec');
    assert.equal(command.args.includes(plan.containerName), true);
    assert.equal(command.args.includes('/usr/local/bin/node'), true);
    assert.equal(command.args.some(value => typeof value === 'string'
      && value.startsWith(repositoryRoot)), false);
  }
  assert.equal(commands[1].args.includes('/results/generation.json'), true);
  assert.equal(commands.at(-1).args.includes('/results/browser-summary.json'), true);
});

function operations(events, failure = null) {
  const operation = name => async () => {
    events.push(name);
    if (failure === name) throw new Error(name + ' failed');
  };
  return {
    cleanup: async (_plan, retained) => {
      const name = retained ? 'cleanup-success' : events.length === 0
        ? 'cleanup-before' : 'cleanup-failure';
      events.push(name);
      if (failure === name) throw new Error(name + ' failed');
    },
    prepare: operation('prepare'),
    build: operation('build'),
    create: operation('create'),
    waitForReadiness: operation('readiness'),
    runCheck: async (_plan, command) => {
      const name = 'check-' + command.id;
      events.push(name);
      if (failure === name) throw new Error(name + ' failed');
    },
    verifyEvidence: operation('verify-evidence'),
    compactEvidence: operation('compact-evidence'),
    reportFailure: operation('report-failure'),
  };
}

test('completes the candidate lifecycle in one defined sequence', async () => {
  const events = [];
  const plan = candidatePlan({ repositoryRoot, commit });
  await verifyCandidate(plan, operations(events));
  assert.deepEqual(events, [
    'cleanup-before', 'prepare', 'build', 'create', 'readiness',
    ...candidateCheckCommands(plan).map(command => 'check-' + command.id),
    'verify-evidence', 'cleanup-success', 'compact-evidence',
  ]);
});

test('reports a failure and removes the complete failed candidate', async () => {
  const events = [];
  const plan = candidatePlan({ repositoryRoot, commit });
  await assert.rejects(verifyCandidate(plan,
    operations(events, 'check-browser-go')), /check-browser-go failed/);
  assert.deepEqual(events.slice(-2), ['report-failure', 'cleanup-failure']);
  assert.equal(events.includes('verify-evidence'), false);
  assert.equal(events.includes('compact-evidence'), false);
});

test('rejects relative repository paths and malformed commits', () => {
  assert.throws(() => candidatePlan({ repositoryRoot: 'repository', commit }),
    /Repository root must be absolute/);
  assert.throws(() => candidatePlan({ repositoryRoot, commit: path.basename(repositoryRoot) }),
    /Candidate commit must contain 40 lowercase hexadecimal characters/);
});
