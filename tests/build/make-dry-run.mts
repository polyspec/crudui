// The dry run of make that tests read: `make --no-print-directory -n` with MAKEFLAGS=w and without the variables a
// parent make passes down, so GNU Make 3.81 and GNU Make 4, also under a sub-make, print only the commands of the
// target. tests/build/make-dry-run.test.mts fails for a dry run of make outside this module.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/** The environment of a dry run: `env` with MAKEFLAGS=w and without the variables of a parent make. */
export function makeEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, MAKEFLAGS: 'w' };
  for (const name of ['MAKELEVEL', 'GNUMAKEFLAGS', 'MAKEFILES', 'MFLAGS']) delete result[name];
  return result;
}

/** Runs `make --no-print-directory -n <target>` in `cwd`; returns the spawnSync result. */
export function makeDryRun(cwd: string, target: string, { env }: { env?: NodeJS.ProcessEnv } = {}): SpawnSyncReturns<string> {
  return spawnSync('make', ['--no-print-directory', '-n', target], { cwd, encoding: 'utf8', env: makeEnvironment(env) });
}
