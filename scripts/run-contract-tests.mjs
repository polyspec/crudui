#!/usr/bin/env node
/**
 * Execute the test commands declared by the CRUDUI contract manifest. Each command runs its own
 * tests, each with its own timeout, and runs to its end without a limit over them
 * (scripts/run-command.mjs). Every command runs, also after an earlier one failed, and a failed
 * command fails the run after the last command.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { failureOf, runCommand } from './run-command.mjs';
import { createProgress } from './kit/test-progress.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));
const requested = process.argv.slice(2);
const featureId = requested[0] === '--feature' ? requested[1] : undefined;
const features = featureId ? manifest.features.filter((feature) => feature.id === featureId) : manifest.features;

if (featureId && features.length === 0) {
  process.stderr.write(`manifest tests: unknown feature: ${featureId}\n`);
  process.exit(2);
}

const commands = new Map();
for (const feature of features) {
  for (const verification of feature.verification ?? []) {
    const owners = commands.get(verification.command) ?? [];
    owners.push(`${feature.id}/${verification.id}`);
    commands.set(verification.command, owners);
  }
}

// Each declared command prints its own tests; this runner prints the command around them.
const lines = createProgress({ write: text => process.stdout.write(text) });
// A selection without a command checks nothing, so it fails.
if (commands.size === 0) {
  lines.line(`✖ manifest:test: ran no command: the selected features declare no verification command (${features.map(feature => feature.id).join(', ') || 'no feature'})`);
  lines.close('manifest:test');
  process.exit(1);
}
// Every declared command runs, also after an earlier one failed, so one run reports every failure.
const failed = [];
for (const [command, owners] of commands) {
  const id = `${owners.join(', ')}: ${command}`;
  lines.start(id, { group: true });
  const result = await runCommand({ command: '/bin/sh', args: ['-c', command], cwd: root });
  const failure = failureOf(result);
  if (failure) {
    lines.fail(id, result.elapsedMs, failure);
    failed.push(id);
  } else lines.pass(id, result.elapsedMs);
}
lines.close(`manifest:test: ${commands.size} declared commands${failed.length ? `, failed: ${failed.join('; ')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
