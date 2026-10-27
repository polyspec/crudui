// The dry run of make that tests read: `make --no-print-directory -n` with MAKEFLAGS=w and without the variables a
// parent make passes down, so GNU Make 3.81 and GNU Make 4, also under a sub-make, print only the commands of the
// target. tests/build/make-dry-run.test.mts fails for a dry run of make outside this module.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The environment of a dry run: `env` with MAKEFLAGS=w and without the variables of a parent make. */
export function makeEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, MAKEFLAGS: 'w' };
  for (const name of ['MAKELEVEL', 'GNUMAKEFLAGS', 'MAKEFILES', 'MFLAGS']) delete result[name];
  return result;
}

/**
 * Runs `make --no-print-directory -n <target>` in `cwd`, with the make variables `variables` (`NAME=value`) on the
 * command line; database also prints the make database with -p. Returns the spawnSync result.
 */
export function makeDryRun(cwd: string, target: string, { env, variables = [], database = false }: { env?: NodeJS.ProcessEnv; variables?: string[]; database?: boolean } = {}): SpawnSyncReturns<string> {
  return spawnSync('make', ['--no-print-directory', '-n', ...(database ? ['-p'] : []), target, ...variables], { cwd, encoding: 'utf8', env: makeEnvironment(env) });
}

/** The installed kit CLI path selected by its public test-runner export. */
export function kitToolPath(name: string): string {
  const runner = fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests'));
  return path.join(path.dirname(runner), `${name}${path.extname(runner)}`);
}
