#!/usr/bin/env node
// Install the cargo-audit release that `cargoAudit` of config/toolchain.json records into the checkout, for the
// advisories of the Cargo locks in `make dependency-review` (docs/spec/package-build.md, "Dependency review"). The
// release is built with `cargo install --locked` into a temporary directory of .tools, checked there and renamed to
// .tools/cargo-audit, so a reader never sees a partly installed tool. An installed recorded release is kept. Nothing is
// installed into the machine: the cargo of the machine keeps its own binaries.
//
//   node scripts/install-cargo-audit.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { failureOf, formatSeconds, runCommand } from './run-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The installation directory of cargo-audit under `root`. */
export const cargoAuditPrefix = (root = ROOT) => path.join(root, '.tools', 'cargo-audit');

/** The cargo-audit command of the checkout under `root`. */
export const cargoAuditCommand = (root = ROOT) => path.join(cargoAuditPrefix(root), 'bin', 'cargo-audit');

/** The exact cargo-audit release of config/toolchain.json, or an error naming the expected form. */
export function recordedCargoAudit(root = ROOT) {
  const value = JSON.parse(readFileSync(path.join(root, 'config', 'toolchain.json'), 'utf8')).cargoAudit;
  if (!/^\d+\.\d+\.\d+$/.test(value ?? '')) throw new Error(`config/toolchain.json must record cargoAudit as <major>.<minor>.<patch>; it records ${JSON.stringify(value)}`);
  return value;
}

/** The release that the cargo-audit command under `prefix` prints, or undefined when none is installed. */
function installedRelease(prefix) {
  const command = path.join(prefix, 'bin', 'cargo-audit');
  if (!existsSync(command)) return undefined;
  return /^cargo-audit (\S+)$/m.exec(execFileSync(command, ['--version'], { encoding: 'utf8' }))?.[1];
}

/**
 * Installs cargo-audit `recorded` into .tools/cargo-audit of `root`, unless that release is installed there. Returns
 * `{ installed, release }`; throws with the expected and the actual release when the result is not `recorded`.
 */
export async function installCargoAudit({ root = ROOT, recorded = recordedCargoAudit(root), print = () => {} } = {}) {
  const prefix = cargoAuditPrefix(root);
  const found = installedRelease(prefix);
  if (found === recorded) {
    print(`cargo-audit: ${recorded} is installed in ${path.relative(root, prefix)}`);
    return { installed: false, release: recorded };
  }
  print(`cargo-audit: ${found ? `${found} is installed` : 'none is installed'} in ${path.relative(root, prefix)}; installing ${recorded}`);
  mkdirSync(path.dirname(prefix), { recursive: true });
  const next = mkdtempSync(`${prefix}.next-`);
  try {
    const args = ['install', '--locked', '--root', next, '--target-dir', path.join(next, 'build'), `cargo-audit@${recorded}`];
    const result = await runCommand({ command: 'cargo', args, cwd: root });
    const failure = failureOf(result);
    if (failure) throw new Error(`cargo ${args.join(' ')} ${failure}`);
    rmSync(path.join(next, 'build'), { recursive: true, force: true });
    const release = installedRelease(next);
    if (release !== recorded) throw new Error(`the installation of cargo-audit ${recorded} into ${next} prints ${release}; expected ${recorded}`);
    // The old installation moves aside with one rename and the new one takes its place with another.
    const old = `${prefix}.old-${process.pid}`;
    if (existsSync(prefix)) renameSync(prefix, old);
    renameSync(next, prefix);
    rmSync(old, { recursive: true, force: true });
    print(`cargo-audit: installed ${recorded} in ${path.relative(root, prefix)} in ${formatSeconds(result.elapsedMs)}`);
    return { installed: true, release: recorded };
  } finally {
    rmSync(next, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = 'cargo-audit: the release that config/toolchain.json records, in .tools/cargo-audit';
  lines.start(id, { group: true });
  try {
    await installCargoAudit({ print: text => lines.line(text) });
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.message);
    process.exitCode = 1;
  }
  lines.close('cargo-audit');
}
