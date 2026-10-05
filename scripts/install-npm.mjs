#!/usr/bin/env node
// Install the npm release that `packageManager` of package.json records into the checkout
// (scripts/checkout-npm.mjs, docs/spec/package-build.md "Runtime and dependency versions"). The
// release goes into a temporary directory of .tools with `npm install --prefix`, is checked there,
// and is renamed to .tools/npm, so a reader never sees a partly installed npm. An installed
// recorded release is kept. The npm of the machine is never changed: no `--global` install runs.
// The command prints the release it found and the one it installs, and fails with the expected
// and the actual release when the installed npm is not the recorded one.
//
//   node scripts/install-npm.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { npmBin, npmPrefix, ROOT } from './checkout-npm.mjs';
import { failureOf, formatSeconds, runCommand } from './run-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

/** The exact npm release of `packageManager`, or an error naming the expected form. */
export function recordedNpm(manifest) {
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  if (!match) throw new Error(`package.json must record packageManager as npm@<major>.<minor>.<patch>; it records ${manifest.packageManager}`);
  return match[1];
}

/** The release of the npm installed under `prefix`, or undefined when none is installed. */
function installedRelease(prefix) {
  const manifest = path.join(prefix, 'node_modules', 'npm', 'package.json');
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : undefined;
}

/** The release that the npm command under `prefix` prints. */
const commandRelease = prefix => execFileSync(path.join(prefix, 'node_modules', '.bin', 'npm'), ['--version'], { encoding: 'utf8' }).trim();

/**
 * Installs npm `recorded` into .tools/npm of `root` with the npm command `npm`, unless that
 * release is installed there. Returns `{ installed, release }`; throws with the expected and the
 * actual release when the result is not `recorded`.
 */
export async function installNpm({ root = ROOT, recorded, npm = 'npm', print = () => {} }) {
  const prefix = npmPrefix(root);
  const found = installedRelease(prefix);
  if (found === recorded) {
    print(`npm: ${recorded} is installed in ${path.relative(root, prefix)}`);
    return { installed: false, release: recorded };
  }
  print(`npm: ${found ? `${found} is installed in ${path.relative(root, prefix)}` : `no npm is installed in ${path.relative(root, prefix)}`}; installing ${recorded}`);
  mkdirSync(path.dirname(prefix), { recursive: true });
  const next = mkdtempSync(`${prefix}.next-`);
  try {
    const args = ['install', '--prefix', next, '--no-audit', '--no-fund', `npm@${recorded}`];
    const result = await runCommand({ command: npm, args, cwd: next });
    const failure = failureOf(result);
    if (failure) throw new Error(`${npm} ${args.join(' ')} ${failure}`);
    const release = installedRelease(next);
    const printed = commandRelease(next);
    if (release !== recorded || printed !== recorded) throw new Error(`the installation of npm ${recorded} into ${next} holds npm ${release} and its command prints ${printed}; expected ${recorded}`);
    // The old installation moves aside with one rename and the new one takes its place with another.
    const old = `${prefix}.old-${process.pid}`;
    if (existsSync(prefix)) renameSync(prefix, old);
    renameSync(next, prefix);
    rmSync(old, { recursive: true, force: true });
    print(`npm: installed ${recorded} in ${path.relative(root, prefix)} in ${formatSeconds(result.elapsedMs)}; ${path.relative(root, npmBin(root))} goes first on PATH`);
    return { installed: true, release: recorded };
  } finally {
    rmSync(next, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = 'npm: the release that package.json records, in .tools/npm';
  lines.start(id, { group: true });
  try {
    await installNpm({ recorded: recordedNpm(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))), print: text => lines.line(text) });
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.message);
    process.exitCode = 1;
  }
  lines.close('npm');
}
