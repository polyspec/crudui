#!/usr/bin/env node
// Build the Go and Rust benchmark drivers before tests/build/bench-drivers.test.mjs runs them.
// Each build prints its start and command, streams the output of the compiler as it runs, prints a
// line while it is still running, and ends with its result and its elapsed time. A build has no
// time limit: its exit status decides the result (scripts/run-command.mjs).
import { failureOf, runCommand } from '../../scripts/run-command.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';
import { compiledDrivers } from './drivers.mjs';

const progress = createProgress({ write: text => process.stdout.write(text) });
let failed = false;
for (const [language, { build }] of Object.entries(compiledDrivers())) {
  const id = `build: ${language} benchmark driver`;
  progress.start(id);
  progress.line(`${id}: ${build.command} ${build.args.join(' ')}`);
  const result = await runCommand(build);
  const failure = failureOf(result);
  if (failure) {
    failed = true;
    progress.fail(id, result.elapsedMs, failure);
  } else {
    progress.pass(id, result.elapsedMs);
  }
}
const summary = progress.close('build-drivers');
if (failed || !summary.ok) process.exitCode = 1;
