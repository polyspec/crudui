#!/usr/bin/env node
/*
 * Build the workspace packages only when the built output is not current.
 *
 * Several commands need the same built packages: the native generator suite, the
 * form suites, the package install check and the contract tests. Each of them used
 * to run `npm run build` again, so one verification run built the same packages
 * three times. The rule here replaces that repetition: a command declares that it
 * needs a current build, and the build runs only when the recorded source and output
 * digests no longer match the working tree. The build runs to its end without a time limit, and
 * its output streams as it runs (scripts/run-command.mts).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { failureOf, formatSeconds, runCommand } from './run-command.mts';
import { createProgress } from '@polyspec/kit/test-progress';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAMP = path.join(ROOT, 'node_modules/.cache/crudui/build-stamp.json');
const PACKAGES = ['validator/ts', 'generator/ts', 'html', 'react', 'vue', 'svelte', 'form-binding'];
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|svelte|vue|css)$/;

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

async function walk(
  directory: string, entries: Record<string, string>, accept: (name: string) => boolean,
): Promise<void> {
  let listing;
  try { listing = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  for (const entry of listing.sort((first, second) => first.name.localeCompare(second.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file, entries, accept);
    else if (entry.isFile() && accept(entry.name)) entries[path.relative(ROOT, file)] = digest(await readFile(file));
  }
}

/** Digest every input the build reads and every file it wrote. */
interface BuildState {
  inputs: string;
  outputs: string;
  packages: string[];
}

async function state(): Promise<BuildState> {
  const inputs: Record<string, string> = {}, outputs: Record<string, string> = {};
  for (const name of PACKAGES) {
    const base = path.join(ROOT, 'packages', name);
    await walk(path.join(base, 'src'), inputs, file => SOURCE_FILE.test(file));
    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'vite.config.ts', 'svelte.config.js']) {
      try { inputs[path.relative(ROOT, path.join(base, file))] = digest(await readFile(path.join(base, file))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await walk(path.join(base, 'dist'), outputs, () => true);
  }
  for (const file of ['package.json', 'package-lock.json', 'scripts/require-current-build.mts']) {
    inputs[file] = digest(await readFile(path.join(ROOT, file)));
  }
  return { inputs: digest(JSON.stringify(inputs)), outputs: digest(JSON.stringify(outputs)), packages: PACKAGES };
}

/** Run the build to its end; its exit status decides the result. */
async function run(command: string, args: string[]): Promise<void> {
  const result = await runCommand({ command, args, cwd: ROOT });
  const failure = failureOf(result);
  if (failure) throw new Error(`${command} ${args.join(' ')} ${failure}`);
  lines.line(`build: ${command} ${args.join(' ')} finished in ${formatSeconds(result.elapsedMs)}`);
}

const lines = createProgress({ write: text => process.stdout.write(text) });
const id = 'build: workspace packages';
lines.start(id, { group: true });
const current = await state();
let recorded: BuildState | undefined;
try { recorded = JSON.parse(await readFile(STAMP, 'utf8')) as BuildState; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
if (recorded && recorded.inputs === current.inputs && recorded.outputs === current.outputs) {
  lines.pass(id);
  lines.line('build: packages are current; no build needed');
} else {
  lines.line(`build: ${recorded ? 'sources or output changed' : 'no recorded build'}; building ${PACKAGES.length} packages`);
  try {
    await run('npm', ['run', 'build']);
  } catch (error) {
    lines.fail(id, undefined, (error as Error).message);
    throw error;
  }
  await mkdir(path.dirname(STAMP), { recursive: true });
  // Another run reads the stamp at any time, so it is written to a file of this process and renamed into place.
  await writeFile(`${STAMP}.${process.pid}`, `${JSON.stringify(await state(), null, 2)}\n`);
  await rename(`${STAMP}.${process.pid}`, STAMP);
  lines.pass(id);
}
lines.close('build');
