#!/usr/bin/env node
// Check that every tool runs at the exact version that the checkout records (docs/spec/package-build.md, "Runtime and
// dependency versions"):
//   node       .node-version
//   npm        packageManager of package.json (installed into .tools/npm by scripts/install-npm.mjs)
//   go         .go-version, with GOTOOLCHAIN=local so go never downloads another toolchain
//   rust       channel of rust-toolchain.toml, as rustup selects it in the checkout without installing it
//   php        config/toolchain.json `php`: one exact release for each tested minor
//   composer   config/toolchain.json `composer`
// Every named tool is checked, also after a mismatch; each mismatch names the record, the expected and the running
// version, and the fix.
//
//   node scripts/check-toolchain.mjs [node] [npm] [go] [rust] [php] [composer]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './checkout-npm.mjs';
import { recordedNpm } from './install-npm.mjs';
import { createProgress } from './test-progress/progress.mjs';

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

/** The recorded exact versions of the checkout at `root`. */
export function recordedToolchain(root = ROOT) {
  const exact = (file, value) => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`${file} must record one exact version <major>.<minor>.<patch>; it records ${JSON.stringify(value)}`);
    return value;
  };
  const config = JSON.parse(read(root, 'config/toolchain.json'));
  const rust = /^\s*channel\s*=\s*"([^"]*)"\s*$/m.exec(read(root, 'rust-toolchain.toml'))?.[1];
  const php = config.php;
  if (!Array.isArray(php) || php.length === 0) throw new Error(`config/toolchain.json must record php as a list of exact releases; it records ${JSON.stringify(php)}`);
  return {
    node: exact('.node-version', read(root, '.node-version').trim()),
    npm: recordedNpm(JSON.parse(read(root, 'package.json'))),
    go: exact('.go-version', read(root, '.go-version').trim()),
    rust: exact('rust-toolchain.toml channel', rust ?? ''),
    php: php.map(value => exact('config/toolchain.json php', value)),
    composer: exact('config/toolchain.json composer', config.composer),
  };
}

// The command that prints a tool's version, the pattern that reads it and the record that names it.
const probes = {
  node: { command: 'node', args: ['--version'], pattern: /^v(\d+\.\d+\.\d+)$/m, record: '.node-version' },
  npm: { command: 'npm', args: ['--version'], pattern: /^(\d+\.\d+\.\d+)$/m, record: 'packageManager of package.json', fix: 'node scripts/install-npm.mjs, and .tools/npm/node_modules/.bin first on PATH' },
  go: { command: 'go', args: ['env', 'GOVERSION'], pattern: /^go(\d+\.\d+\.\d+)$/m, record: '.go-version' },
  rust: { command: 'rustc', args: ['--version'], pattern: /^rustc (\d+\.\d+\.\d+) /m, record: 'rust-toolchain.toml', fix: 'make install (rustup toolchain install --no-self-update)' },
  php: { command: 'php', args: ['-r', 'echo PHP_VERSION, "\\n";'], pattern: /^(\d+\.\d+\.\d+)$/m, record: 'config/toolchain.json php' },
  composer: { command: 'composer', args: ['--version', '--no-ansi'], pattern: /^Composer version (\d+\.\d+\.\d+) /m, record: 'config/toolchain.json composer' },
};

export const TOOLS = Object.keys(probes);

/**
 * The mismatches of `tools` at `root`: one line for each tool that does not run at its recorded version. `run` starts a
 * version command and returns `{ status, stdout, stderr, error }`.
 */
export function toolchainMismatches(tools, { root = ROOT, env = process.env, run = (command, args) => spawnSync(command, args, { cwd: root, env, encoding: 'utf8' }) } = {}) {
  const recorded = recordedToolchain(root);
  const mismatches = [];
  for (const tool of tools) {
    const probe = probes[tool];
    if (!probe) throw new Error(`unknown tool ${tool}; the tools are ${TOOLS.join(', ')}`);
    const result = run(probe.command, probe.args);
    const shown = `${probe.command} ${probe.args.join(' ')}`;
    if (result.error || result.status !== 0) {
      mismatches.push(`${tool}: \`${shown}\` failed (${result.error?.message ?? `status ${result.status}`}): ${String(result.stderr ?? '').trim()}`);
      continue;
    }
    const running = probe.pattern.exec(result.stdout)?.[1];
    // PHP records one exact release for each tested minor; the running minor selects it.
    const expected = tool === 'php' ? recorded.php.find(release => running && release.split('.').slice(0, 2).join('.') === running.split('.').slice(0, 2).join('.')) ?? recorded.php.join(' or ') : recorded[tool];
    if (running !== expected) {
      mismatches.push(`${tool}: ${running ?? `no version in the output of \`${shown}\`: ${result.stdout.trim()}`} runs here and ${probe.record} records ${expected}; fix: ${probe.fix ?? `install ${tool} ${expected}`}`);
    }
  }
  return mismatches;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tools = process.argv.slice(2);
  if (tools.length === 0) {
    process.stderr.write(`Usage: node scripts/check-toolchain.mjs <tool>...; the tools are ${TOOLS.join(', ')}\n`);
    process.exit(2);
  }
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = `toolchain: ${tools.join(', ')} at the recorded versions`;
  lines.start(id, { group: true });
  const mismatches = toolchainMismatches(tools);
  if (mismatches.length === 0) lines.pass(id);
  else lines.fail(id, undefined, mismatches.join('\n'));
  lines.close('toolchain');
  process.exitCode = mismatches.length === 0 ? 0 : 1;
}
