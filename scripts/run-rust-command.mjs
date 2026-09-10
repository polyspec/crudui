#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRustToolchain, runCommand } from './tool-resolution.mjs';

/** Execute one Cargo command with the complete Rust toolchain selected by Rustup. */
export async function runRustCommand(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some(value => typeof value !== 'string')) {
    throw new TypeError('One Cargo command and its string arguments are required');
  }
  const environment = options.environment ?? process.env;
  const tools = await resolveRustToolchain({
    cargo: options.cargo ?? environment.CARGO,
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
  runRustCommand(process.argv.slice(2)).catch(error => {
    process.stderr.write((error.stack ?? error.message ?? String(error)) + '\n');
    process.exitCode = 1;
  });
}
