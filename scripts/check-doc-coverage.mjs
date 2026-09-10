#!/usr/bin/env node
/** Check documentation for public TypeScript, Go, Rust and PHP package APIs. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUST_COMMAND = join(ROOT, 'scripts/run-rust-command.mjs');
const target = process.argv[2] ?? 'all';
if (!['all', 'ts', 'go', 'rust', 'php'].includes(target)) throw new Error('Use all, ts, go, rust or php');
const want = name => target === 'all' || target === name;
const results = [];
function check(name, operation) {
  try {
    operation();
    results.push({ name, passed: true });
    process.stdout.write(`[doc-coverage] ${name}: PASS\n`);
  } catch (error) {
    results.push({ name, passed: false });
    process.stderr.write(`[doc-coverage] ${name}: FAIL: ${error.message}\n`);
  }
}
function run(command, args, cwd = ROOT) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

if (want('ts')) {
  check('ts:build', () => run('npm', ['run', 'build']));
  if (results.at(-1).passed) for (const pkg of ['generator-core', 'validator-ts', 'generator-react', 'generator-vue', 'generator-svelte']) {
    const svelte = pkg === 'generator-svelte';
    check(`ts:${pkg}`, () => run(join(ROOT, 'node_modules/.bin/typedoc'), [
      '--options', join(ROOT, 'scripts/typedoc.check.json'),
      '--tsconfig', join(ROOT, svelte ? 'scripts/tsconfig.svelte-docs.json' : `packages/${pkg}/tsconfig.json`),
      '--entryPointStrategy', 'resolve',
      join(ROOT, 'packages', pkg, svelte ? 'dist/index.d.ts' : 'src/index.ts'),
    ]));
  }
}
if (want('go')) for (const pkg of ['validator-go', 'generator-go']) {
  check(`go:${pkg}`, () => run(process.env.GO ?? 'go', ['test', './...', '-run', 'DocCoverage', '-count=1'], join(ROOT, 'packages', pkg)));
}
if (want('rust')) for (const pkg of ['validator-rust', 'generator-rust']) {
  check(`rust:${pkg}`, () => run(process.execPath, [
    RUST_COMMAND, 'build', '--locked', '--lib',
  ], join(ROOT, 'packages', pkg)));
}
if (want('php')) {
  check('php:validator-and-generator', () => run(process.env.PHP ?? 'php', [join(ROOT, 'scripts/php-doc-coverage.php')]));
}
const failed = results.filter(result => !result.passed).length;
process.stdout.write(`[doc-coverage] ${results.length - failed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
