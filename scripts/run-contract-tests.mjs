#!/usr/bin/env node
/** Execute the test commands declared by the CRUDUI contract manifest. */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProgress } from './test-progress/progress.mjs';

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
for (const [command, owners] of commands) {
  const id = `${owners.join(', ')}: ${command}`;
  lines.start(id, { group: true });
  const result = spawnSync('/bin/sh', ['-lc', command], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    lines.fail(id, undefined, `failed with status ${result.status ?? 'signal'}`);
    lines.close('manifest:test');
    process.exit(result.status ?? 1);
  }
  lines.pass(id);
}
lines.close(`manifest:test: ${commands.size} declared commands`);
