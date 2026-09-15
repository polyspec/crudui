import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deploymentContainer } from './comparison-deployment.mjs';
import { containerRuntime } from './container-runtime.mjs';
import { treeDirectory } from './src/server-layout.mjs';
import { sameSourceIdentity } from './src/source-identity.mjs';
import { sourceIdentity } from './src/source-tree.mjs';
import { formatDuration, runStep, stopStepsOnSignal } from './src/step-runner.mjs';
import { verifyEvidence } from './verification-evidence.mjs';
import { buildReadinessLimitMs, verificationStages } from './verify-tree.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Return the container arguments that run one verification inside the comparison container. */
export function verificationCommand(containerName) {
  return ['exec', '--user', 'node', '--env', 'HOME=/home/node', containerName,
    'node', path.join(treeDirectory, 'examples/form-comparison/verify-tree.mjs')];
}

/**
 * The host command holds no limit of its own: it waits exactly as long as the checks inside the
 * container may take, which is the readiness wait before and after the run plus the longest step
 * of each stage, and one minute for the container command itself.
 */
export function verificationLimitMs() {
  const stages = verificationStages()
    .reduce((sum, stage) => sum + Math.max(...stage.map(step => step.timeoutMs)), 0);
  return 2 * buildReadinessLimitMs + stages + 60_000;
}

async function execute(args) {
  const runtime = await containerRuntime();
  const result = await runStep({
    id: 'tree-verification', command: runtime.executable, args,
    environment: runtime.environment, timeoutMs: verificationLimitMs(),
  }, { label: 'verification' });
  assert.equal(result.status, 'passed', `Verification inside ${args[5]} ${result.status} after `
    + `${formatDuration(result.durationMs)}`);
  return result;
}

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node examples/form-comparison/verification.mjs');
  stopStepsOnSignal();
  const before = await sourceIdentity(repositoryRoot);
  const run = await execute(verificationCommand(deploymentContainer));
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
