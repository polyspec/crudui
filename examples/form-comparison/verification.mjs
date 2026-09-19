import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deploymentContainer } from './comparison-deployment.mjs';
import { containerRuntime } from './container-runtime.mjs';
import { treeDirectory } from './src/server-layout.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import { sourceIdentity } from './src/source-tree.mjs';
import {
  formatDuration, runStep, stepSilenceLimitMs, stopStepsOnSignal,
} from './src/step-runner.mjs';
import { verifyEvidence } from './verification-evidence.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Return the container arguments that run one verification inside the comparison container, of
 * the build of `source`, this checkout's identity.
 */
export function verificationCommand(containerName, source) {
  return ['exec', '--user', 'node', '--env', 'HOME=/home/node', containerName,
    'node', path.join(treeDirectory, 'examples/form-comparison/verify-tree.mjs'), JSON.stringify(source)];
}

/**
 * The host step that runs one verification inside the container. The run consists of steps and
 * units with their own limits, so the host holds no total limit: it stops the run when the run
 * prints no progress line within the inactivity limit.
 */
export function verificationStep(containerName, runtime, source) {
  return {
    id: 'tree-verification', command: runtime.executable, args: verificationCommand(containerName, source),
    environment: runtime.environment, silenceLimitMs: stepSilenceLimitMs,
  };
}

async function execute(containerName, source) {
  const runtime = await containerRuntime();
  const result = await runStep(verificationStep(containerName, runtime, source), { label: 'verification' });
  assert.equal(result.status, 'passed', `Verification inside ${containerName} ${result.status} after `
    + `${formatDuration(result.durationMs)}`);
  return result;
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node examples/form-comparison/verification.mjs');
  stopStepsOnSignal();
  const before = await sourceIdentity(repositoryRoot);
  const run = await execute(deploymentContainer, before);
  const results = path.join(repositoryRoot, '.form-comparison/deployment/results');
  const summary = JSON.parse(await readFile(path.join(results, 'verification.json'), 'utf8'));
  assert.equal(summary.passed, true, 'The verification summary did not pass');
  const evidence = await verifyEvidence(results);
  const after = await sourceIdentity(repositoryRoot);
  for (const [name, value] of [['summary', summary.source], ['evidence', evidence.source]]) {
    assert.ok(sameSourceIdentity(value, before) && sameSourceIdentity(value, after),
      `The verification ${name} describes a different tree than this checkout`);
  }
  const durations = (summary.checks ?? [])
    .map(check => `${check.id} ${formatDuration(check.durationMs ?? 0)}`).join(', ');
  process.stdout.write(`Verified ${JSON.stringify(after)} in ${formatDuration(run.durationMs)}: `
    + `${evidence.generation.results} generation, ${evidence.persistence.results} persistence and `
    + `${evidence.browser.checks} browser checks (${durations})\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
