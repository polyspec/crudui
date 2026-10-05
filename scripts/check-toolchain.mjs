#!/usr/bin/env node
// Check that every tool runs at the exact version that the checkout records (docs/spec/package-build.md, "Runtime and
// dependency versions"):
//   node       .node-version
//   npm        packageManager of package.json (installed into .tools/npm by scripts/install-npm.mjs)
//   go         .go-version, with GOTOOLCHAIN=local so go never downloads another toolchain
//   rust       channel of rust-toolchain.toml, as rustup selects it in the checkout without installing it
//   php        config/toolchain.json `php`: the tested minor releases; setup-php and Homebrew cannot install the
//              same patch, so the major and minor are compared and the running patch is evidence
//   python     config/toolchain.json `python`: the minor release of the Python test tools, compared like PHP
//   composer   config/toolchain.json `composer`
// Every named tool is checked, also after a mismatch; each mismatch names the record, the expected and the running
// version, and the fix.
//
//   node scripts/check-toolchain.mjs [node] [npm] [go] [rust] [php] [composer]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordedNpm, ROOT } from './checkout-npm.mjs';
import { createProgress } from './test-progress/progress.mjs';

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

/** A minor release `<major>.<minor>` of config/toolchain.json, or an error naming the expected form. */
function minorRecord(value) {
  if (!/^\d+\.\d+$/.test(value ?? '')) throw new Error(`config/toolchain.json must record python as one minor release <major>.<minor>; it records ${JSON.stringify(value)}`);
  return value;
}

/** The recorded exact versions of the checkout at `root`. */
export function recordedToolchain(root = ROOT) {
  const exact = (file, value) => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`${file} must record one exact version <major>.<minor>.<patch>; it records ${JSON.stringify(value)}`);
    return value;
  };
  const config = JSON.parse(read(root, 'config/toolchain.json'));
  const rust = /^\s*channel\s*=\s*"([^"]*)"\s*$/m.exec(read(root, 'rust-toolchain.toml'))?.[1];
  const php = config.php;
  if (!Array.isArray(php) || php.length === 0 || php.some(value => !/^\d+\.\d+$/.test(value))) {
    throw new Error(`config/toolchain.json must record php as a list of minor releases <major>.<minor>; it records ${JSON.stringify(php)}`);
  }
  return {
    node: exact('.node-version', read(root, '.node-version').trim()),
    npm: recordedNpm(JSON.parse(read(root, 'package.json'))),
    go: exact('.go-version', read(root, '.go-version').trim()),
    rust: exact('rust-toolchain.toml channel', rust ?? ''),
    php,
    python: minorRecord(config.python),
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
  python: { command: 'python3', args: ['--version'], pattern: /^Python (\d+\.\d+\.\d+)$/m, record: 'config/toolchain.json python' },
  composer: { command: 'composer', args: ['--version', '--no-ansi'], pattern: /^Composer version (\d+\.\d+\.\d+) /m, record: 'config/toolchain.json composer' },
};

export const TOOLS = Object.keys(probes);

const defaultRun = (root, env) => (command, args) => spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });

/**
 * The release of each of `tools` that runs at `root`, as `{ tool: release }`, or `unavailable: <reason>`. A run records
 * them as the evidence of what it ran on, the patch of PHP included.
 */
export function toolchainVersions(tools = TOOLS, { root = ROOT, env = process.env, run = defaultRun(root, env) } = {}) {
  return Object.fromEntries(tools.map(tool => {
    const probe = probes[tool];
    const result = run(probe.command, probe.args);
    if (result.error || result.status !== 0) return [tool, `unavailable: ${probe.command} ${result.error?.message ?? `exited with ${result.status}`}`];
    return [tool, probe.pattern.exec(result.stdout)?.[1] ?? `unavailable: no version in ${JSON.stringify(result.stdout.trim())}`];
  }));
}

/**
 * The mismatches of `tools` at `root`: one line for each tool that does not run at its recorded version. `run` starts a
 * version command and returns `{ status, stdout, stderr, error }`.
 */
export function toolchainMismatches(tools, { root = ROOT, env = process.env, run = defaultRun(root, env) } = {}) {
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
    // PHP and Python are pinned by their minor release; the patch of the run is evidence, not a requirement.
    const minor = running?.split('.').slice(0, 2).join('.');
    const minors = { php: recorded.php, python: [recorded.python] }[tool];
    const expected = minors ? minors.join(' or ') : recorded[tool];
    if (minors ? !minors.includes(minor) : running !== expected) {
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
  // The releases that run here are the evidence of the run, the patch of PHP included.
  lines.line(`toolchain: ${Object.entries(toolchainVersions(tools)).map(([tool, release]) => `${tool} ${release}`).join(', ')}`);
  if (mismatches.length === 0) lines.pass(id);
  else lines.fail(id, undefined, mismatches.join('\n'));
  lines.close('toolchain');
  process.exitCode = mismatches.length === 0 ? 0 : 1;
}
