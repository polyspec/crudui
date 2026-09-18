#!/usr/bin/env node
/**
 * Execute the test commands declared by the CRUDUI contract manifest. Each command has a time limit
 * (scripts/bounded-command.mjs); at the limit its whole process group stops and the run fails.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { commandLimitMs, failureOf, runBounded } from './bounded-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A declared command runs the test files of one package.
const COMMAND_LIMIT_SECONDS = 600;
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
const limitMs = commandLimitMs(COMMAND_LIMIT_SECONDS);
const lines = createProgress({ write: text => process.stdout.write(text) });
for (const [command, owners] of commands) {
  const id = `${owners.join(', ')}: ${command}`;
  lines.start(id, { group: true });
  const result = await runBounded({ command: '/bin/sh', args: ['-lc', command], cwd: root, limitMs });
  const failure = failureOf(result, limitMs);
  if (failure) {
    lines.fail(id, result.elapsedMs, failure);
    lines.close('manifest:test');
    process.exit(result.status || 1);
  }
  lines.pass(id, result.elapsedMs);
}
lines.close(`manifest:test: ${commands.size} declared commands`);
