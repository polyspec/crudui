#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRustToolchain, runCommand } from './tool-resolution.mjs';

/** The checkout of `cwd`: the top level of its Git working tree, or `cwd` outside one. */
function checkoutOf(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : path.resolve(cwd);
}

/**
 * Refuse a CARGO_TARGET_DIR outside the checkout of `cwd`. Cargo judges the freshness of an output by
 * modification times, so a target directory that another checkout also builds into lets a build
 * reuse outputs compiled from that checkout's sources.
 */
export function requireCheckoutTarget(cwd, environment) {
  if (!environment.CARGO_TARGET_DIR) return;
  const target = path.resolve(cwd, environment.CARGO_TARGET_DIR);
  const checkout = checkoutOf(cwd);
  const relative = path.relative(checkout, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`CARGO_TARGET_DIR ${target} is outside the checkout ${checkout} of ${path.resolve(cwd)}; `
      + 'cargo judges freshness by modification times, so a target that another checkout builds into reuses its outputs. '
      + 'Unset CARGO_TARGET_DIR or name a directory inside the checkout.');
  }
}

/** Execute one Cargo command with the complete Rust toolchain selected by Rustup. */
export async function runRustCommand(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some(value => typeof value !== 'string')) {
    throw new TypeError('One Cargo command and its string arguments are required');
  }
  const environment = options.environment ?? process.env;
  requireCheckoutTarget(options.cwd ?? process.cwd(), environment);
  const tools = await resolveRustToolchain({
    cargo: options.cargo ?? environment.CARGO,
    cwd: options.cwd,
    environment,
    run: options.run,
    rustc: options.rustc ?? environment.RUSTC,
    rustdoc: options.rustdoc ?? environment.RUSTDOC,
  });
  await (options.run ?? runCommand)(tools.cargo, args, {
    cwd: options.cwd,
    environment: { ...environment, RUSTC: tools.rustc, RUSTDOC: tools.rustdoc },
  });
  return tools;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRustCommand(process.argv.slice(2), { cwd: process.cwd() }).catch(error => {
    process.stderr.write((error.stack ?? error.message ?? String(error)) + '\n');
    process.exitCode = 1;
  });
}
