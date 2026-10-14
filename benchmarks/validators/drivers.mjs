// The compiled benchmark drivers: where benchmarks/validators/build-drivers.mjs builds the Go and Rust
// drivers and where tests/build/bench-drivers.test.mts runs them. Cargo places the Rust driver
// under CARGO_TARGET_DIR when it is set.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BENCH, '../..');

/** The build command and the program of the Go and Rust drivers. */
export function compiledDrivers(environment = process.env) {
  const rustTarget = environment.CARGO_TARGET_DIR ? path.resolve(environment.CARGO_TARGET_DIR) : path.join(BENCH, 'rust/target');
  const goBinary = path.join(ROOT, 'var/build/benchmarks/polyspec-crudui-bench');
  return {
    go: {
      build: { command: environment.GO ?? 'go', args: ['build', '-o', goBinary, '.'], cwd: path.join(BENCH, 'go') },
      program: goBinary,
    },
    rust: {
      build: {
        command: process.execPath,
        args: [path.join(ROOT, 'scripts/run-rust-command.mts'), 'build', '--release', '--locked', '--quiet'],
        cwd: path.join(BENCH, 'rust'),
      },
      program: path.join(rustTarget, 'release/polyspec-crudui-bench'),
    },
  };
}
