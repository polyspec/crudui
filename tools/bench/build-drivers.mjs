#!/usr/bin/env node
// Build the Go and Rust benchmark drivers before tests/build/bench-drivers.test.mjs runs them.
// Each build prints its start, a line while it is still running, its result and its elapsed time,
// and stops at its limit with its whole process group (scripts/bounded-command.mjs).
// CRUDUI_COMMAND_LIMIT_SECONDS replaces the limit.
import { commandLimitMs, failureOf, runBounded } from '../../scripts/bounded-command.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';
import { compiledDrivers } from './drivers.mjs';

// A cold Rust release build of the validator and the driver; Go builds within seconds.
const BUILD_LIMIT_SECONDS = 600;

const progress = createProgress({ write: text => process.stdout.write(text) });
let failed = false;
for (const [language, { build }] of Object.entries(compiledDrivers())) {
  const id = `build: ${language} benchmark driver`;
  const limitMs = commandLimitMs(BUILD_LIMIT_SECONDS);
  progress.start(id);
  progress.line(`${id}: ${build.command} ${build.args.join(' ')} (limit ${limitMs / 1000}s)`);
  const result = await runBounded({ ...build, limitMs, stdout: 'pipe', stderr: 'pipe' });
  const failure = failureOf(result, limitMs);
  if (failure) {
    failed = true;
    progress.fail(id, result.elapsedMs, `${failure}\n${result.stderr}${result.stdout}`);
  } else {
    progress.pass(id, result.elapsedMs);
  }
}
const summary = progress.close('build-drivers');
if (failed || !summary.ok) process.exitCode = 1;
