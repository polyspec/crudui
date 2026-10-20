#!/usr/bin/env node
/*
 * The reproducible build check: build the workspace packages twice and compare the path and SHA-256
 * digest of every output file of the published packages. Each build is a long operation: it runs to
 * its end without a time limit, its output streams as it runs, and its result is printed with its
 * elapsed time (@polyspec/kit/run-command). The check reads only the outputs of its own two builds and
 * keeps no record between runs; it fails with every file whose bytes differ, is missing in one build
 * or appears in one build only.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';

import { buildOutputs, type BuildOutput } from './package-outputs.mts';
import { failureOf, runCommand } from '@polyspec/kit/run-command';
import { createProgress } from '@polyspec/kit/test-progress';

/** The differences between the outputs of two builds, one line per file, in path order. */
export function buildDifferences(first: readonly BuildOutput[], second: readonly BuildOutput[]): string[] {
  const firstDigests = new Map(first.map(file => [file.path, file.sha256]));
  const secondDigests = new Map(second.map(file => [file.path, file.sha256]));
  const digests = [firstDigests, secondDigests];
  const paths = [...new Set([...firstDigests.keys(), ...secondDigests.keys()])].sort();
  return paths.flatMap(file => {
    const [a, b] = digests.map(map => map.get(file));
    if (a === b) return [];
    if (a === undefined) return [`${file}: only the second build wrote it (${b})`];
    if (b === undefined) return [`${file}: only the first build wrote it (${a})`];
    return [`${file}: the first build wrote ${a}, the second ${b}`];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const outputs: BuildOutput[][] = [];
  for (const name of ['first', 'second']) {
    const id = `build: ${name} build of the workspace packages`;
    lines.start(id, { group: true });
    const result = await runCommand({ command: 'npm', args: ['run', 'build'], cwd: ROOT });
    const failure = failureOf(result);
    if (failure) {
      lines.fail(id, result.elapsedMs, `npm run build ${failure}`);
      lines.close('repeat-build');
      process.exit(1);
    }
    const written = buildOutputs();
    outputs.push(written);
    lines.pass(id, result.elapsedMs);
    lines.line(`build: the ${name} build wrote ${written.length} output files`);
  }
  const id = 'build: both builds wrote the same bytes';
  lines.start(id, { group: true });
  const [first, second] = outputs;
  assert.ok(first && second);
  const differences = buildDifferences(first, second);
  if (differences.length) lines.fail(id, undefined, differences.join('\n'));
  else lines.pass(id);
  lines.close('repeat-build');
  process.exitCode = differences.length ? 1 : 0;
}
