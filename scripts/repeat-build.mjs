#!/usr/bin/env node
/*
 * Build the workspace packages twice for the reproducible build check. Each build is a long
 * operation: it runs to its end without a time limit, its output streams as it runs, and its
 * result is printed with its elapsed time (scripts/run-command.mjs). After each build the path and
 * SHA-256 digest of every output file of the published packages is recorded; the test
 * tests/build/reproducible-build.test.mjs compares both records with the current output.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOutputs, REPEAT_BUILD_DIRECTORY } from './package-outputs.mjs';
import { failureOf, runCommand } from './run-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = createProgress({ write: text => process.stdout.write(text) });
await rm(REPEAT_BUILD_DIRECTORY, { recursive: true, force: true });
await mkdir(REPEAT_BUILD_DIRECTORY, { recursive: true });
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
  const outputs = buildOutputs();
  await writeFile(path.join(REPEAT_BUILD_DIRECTORY, `${name}.json`), `${JSON.stringify(outputs, null, 2)}\n`);
  lines.pass(id, result.elapsedMs);
  lines.line(`build: recorded ${outputs.length} output files of the ${name} build`);
}
lines.close('repeat-build');
