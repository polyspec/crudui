#!/usr/bin/env node
// The crates of every Cargo.lock of the checkout, in the registry of CARGO_HOME (docs/spec/package-build.md, "Offline
// checks"). The Makefile runs cargo offline (CARGO_NET_OFFLINE), and cargo answers a missing crate with "retry without
// --offline", which a check must not do. `make cargo-downloads-check` runs `cargo fetch --locked --offline` for each
// lock, which reads no network, and fails with each lock, the first error line of cargo and the fix, run make install;
// every target that runs cargo depends on it. `make install` runs this script with --fetch, which downloads the crates.
//
//   node scripts/check-cargo-downloads.mjs [--fetch]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProgress } from './test-progress/progress.mjs';
import { trackedFiles } from './tracked-files.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The Cargo locks of the checkout at `root`. */
export const cargoLocks = (root = ROOT) => trackedFiles(root).filter(file => path.posix.basename(file) === 'Cargo.lock');

/**
 * Runs `cargo fetch --locked` for every Cargo lock of `root`, offline unless `fetch`, and returns the failures: one line
 * per lock with the first error line of cargo.
 */
export function cargoDownloads({ root = ROOT, fetch = false, cargo = 'cargo', env = process.env, print = () => {} } = {}) {
  const failures = [];
  const locks = cargoLocks(root);
  for (const lock of locks) {
    const args = ['fetch', '--locked', ...(fetch ? [] : ['--offline']), '--manifest-path', path.join(path.dirname(lock), 'Cargo.toml')];
    const result = spawnSync(cargo, args, { cwd: root, encoding: 'utf8', env });
    // The first error line of cargo names the crate; its help, to retry without --offline, is not the fix of a check.
    if (result.error || result.status !== 0) failures.push(`${lock}: ${result.error?.message ?? result.stderr.split('\n').find(line => line.startsWith('error')) ?? `exit status ${result.status}`}`);
    else print(`${lock}: ${fetch ? 'fetched' : 'every crate is downloaded'}`);
  }
  return { locks, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!(args.length === 0 || (args.length === 1 && args[0] === '--fetch'))) {
    process.stderr.write('Usage: node scripts/check-cargo-downloads.mjs [--fetch]\n');
    process.exit(2);
  }
  const fetch = args[0] === '--fetch';
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = fetch ? 'cargo: download the crates of every Cargo.lock' : 'cargo: the crates of every Cargo.lock are downloaded';
  lines.start(id, { group: true });
  const { locks, failures } = cargoDownloads({ fetch, print: text => lines.line(text) });
  if (failures.length) {
    lines.fail(id, undefined, `the crates of ${failures.length} of ${locks.length} Cargo.lock files are not ${fetch ? 'fetched' : 'in the registry of CARGO_HOME'}:\n${failures.join('\n')}\n${fetch ? 'check the network and run make install again' : 'run make install, which downloads them'}`);
    process.exitCode = 1;
  } else lines.pass(id);
  lines.close('cargo');
}
