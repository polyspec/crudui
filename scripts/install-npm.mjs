#!/usr/bin/env node
// Install the npm release that `packageManager` of package.json records
// (docs/spec/package-build.md, "Runtime and dependency versions"). CI, the container images and
// local runs use that one release, because the npm that installs, packs and runs the scripts
// changes their results. The command prints the release it found and the one it installs, and
// fails when the installed npm is not the recorded release afterwards.
//
//   node scripts/install-npm.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { failureOf, formatSeconds, runCommand } from './run-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** The exact npm release of `packageManager`, or an error naming the expected form. */
export function recordedNpm(manifest) {
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  if (!match) throw new Error(`package.json must record packageManager as npm@<major>.<minor>.<patch>; it records ${manifest.packageManager}`);
  return match[1];
}

const runningNpm = () => execFileSync(npm, ['--version'], { encoding: 'utf8' }).trim();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = 'npm: the release that package.json records';
  lines.start(id, { group: true });
  const recorded = recordedNpm(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
  const before = runningNpm();
  if (before === recorded) {
    lines.line(`npm: ${before} is installed`);
    lines.pass(id);
  } else {
    lines.line(`npm: ${before} is installed; installing ${recorded}`);
    const result = await runCommand({ command: npm, args: ['install', '--global', `npm@${recorded}`], cwd: ROOT });
    const failure = failureOf(result);
    const after = failure ? undefined : runningNpm();
    if (failure) lines.fail(id, undefined, `npm install --global npm@${recorded} ${failure}`);
    else if (after !== recorded) lines.fail(id, undefined, `npm ${after} runs after the installation of ${recorded}; the npm on PATH is not the one that npm install --global replaced`);
    else {
      lines.line(`npm: installed ${recorded} in ${formatSeconds(result.elapsedMs)}`);
      lines.pass(id);
    }
    process.exitCode = failure || after !== recorded ? 1 : 0;
  }
  lines.close('npm');
}
