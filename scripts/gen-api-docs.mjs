#!/usr/bin/env node
/**
 * Generate public API references; a failed tool or missing output fails the command. Each tool
 * command has a time limit, at which its whole process group stops (scripts/bounded-command.mjs),
 * and prints its elapsed time.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative } from 'node:path';

import { commandLimitMs, failureOf, runBounded } from './bounded-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUST_COMMAND = join(ROOT, 'scripts/run-rust-command.mjs');
const API_DIR = join(ROOT, 'docs/api');
const STATIC_API_DIR = join(ROOT, 'docs/public/api');
const target = process.argv[2] ?? 'all';
if (!['all', 'ts', 'go', 'rust', 'php'].includes(target)) {
  throw new Error('Use all, ts, go, rust or php');
}
const want = name => target === 'all' || target === name;
const packages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'generator-svelte'];

// One tool command: a package build, one TypeDoc package, one Go listing or page, rustdoc or phpDocumentor.
const COMMAND_LIMIT_SECONDS = 600;
const limitMs = commandLimitMs(COMMAND_LIMIT_SECONDS);
const lines = createProgress({ write: text => process.stdout.write(text) });
const shown = value => value.startsWith(ROOT) ? relative(ROOT, value) || '.' : value;

/** Run one tool command within its limit; `capture` returns its standard output. */
async function run(command, args, cwd = ROOT, { capture = false } = {}) {
  const id = [basename(command), ...args.map(shown)].join(' ');
  lines.start(id, { group: true });
  const result = await runBounded({ command, args, cwd, limitMs, stdout: capture ? 'pipe' : 'inherit' });
  const failure = failureOf(result, limitMs);
  if (failure) {
    lines.fail(id, result.elapsedMs, failure);
    throw new Error(`Command failed: ${id} ${failure}`);
  }
  lines.pass(id, result.elapsedMs);
  return result.stdout;
}

function requireOutput(path) {
  if (!existsSync(path)) throw new Error(`Documentation output is missing: ${path}`);
}

function cleanDirectory(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

async function genTypeScript() {
  await run('npm', ['run', 'build']);
  for (const pkg of packages) {
    const svelte = pkg === 'generator-svelte';
    const pkgDir = join(ROOT, 'packages', pkg);
    const output = join(API_DIR, pkg);
    cleanDirectory(output);
    const args = [
      '--options', join(ROOT, 'scripts/typedoc.base.json'),
      '--tsconfig', svelte ? join(ROOT, 'scripts/tsconfig.svelte-docs.json') : join(pkgDir, 'tsconfig.build.json'),
      '--name', pkg === 'validator-ts' ? '@crudui/validator' : `@crudui/${pkg}`,
      '--out', output,
      '--entryPointStrategy', 'resolve',
      ...(svelte ? ['--disableSources'] : []),
      join(pkgDir, svelte ? 'dist/index.d.ts' : 'src/index.ts'),
    ];
    await run(join(ROOT, 'node_modules/.bin/typedoc'), args);
    requireOutput(join(output, 'index.md'));
  }
}

async function genGo() {
  const output = join(API_DIR, 'go.md');
  rmSync(output, { force: true });
  const sections = [];
  for (const pkg of ['validator-go', 'generator-go']) {
    const cwd = join(ROOT, 'packages', pkg);
    const go = process.env.GO ?? 'go';
    const listed = (await run(go, ['list', '-f', '{{if ne .Name "main"}}{{.ImportPath}}{{end}}', './...'], cwd, { capture: true })).trim();
    if (!listed) throw new Error(`Go package list is empty: ${pkg}`);
    for (const name of listed.split('\n').filter(Boolean).sort()) {
      const body = (await run(go, ['doc', '-all', name], cwd, { capture: true })).trimEnd();
      if (!body) throw new Error(`Go documentation is empty: ${name}`);
      sections.push(`## ${name}\n\n\`\`\`text\n${body}\n\`\`\`\n`);
    }
  }
  writeFileSync(output, '# Go API\n\n' + sections.join('\n'));
}

async function genRust() {
  const pkgDir = join(ROOT, 'packages/generator-rust');
  const generated = join(pkgDir, 'target/doc');
  const output = join(STATIC_API_DIR, 'rust');
  cleanDirectory(output);
  await run(process.execPath, [
    RUST_COMMAND, 'doc', '--locked', '--no-deps',
    '-p', 'crudui-validator', '-p', 'crudui-generator',
  ], pkgDir);
  requireOutput(join(generated, 'crudui_validator/index.html'));
  requireOutput(join(generated, 'crudui_generator/index.html'));
  cpSync(generated, output, { recursive: true });
  writeFileSync(join(API_DIR, 'rust.md'),
    '# Rust API\n\n- [Validator](/api/rust/crudui_validator/index.html)\n- [Generator](/api/rust/crudui_generator/index.html)\n');
}

async function genPhp() {
  const phar = join(ROOT, 'tools/bin/phpDocumentor.phar');
  requireOutput(phar);
  const output = join(STATIC_API_DIR, 'php');
  const cache = join(ROOT, 'tools/bin/.phpdoc-cache');
  cleanDirectory(output);
  try {
    await run(process.env.PHP ?? 'php', [phar, 'run', '-d', 'packages/validator-php/src', '-d', 'packages/generator-php/src', '-t', output,
      '--cache-folder', cache, '--title', 'CRUDUI PHP API', '--no-interaction']);
    requireOutput(join(output, 'index.html'));
    for (const name of ['Generator', 'Validator', 'Form', 'FormError']) {
      requireOutput(join(output, 'classes', `CRUDUI-${name}.html`));
    }
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  writeFileSync(join(API_DIR, 'php.md'),
    '# PHP API\n\n[Open the PHP API reference](/api/php/index.html).\n');
}

mkdirSync(API_DIR, { recursive: true });
if (want('ts')) await genTypeScript();
if (want('go')) await genGo();
if (want('rust')) await genRust();
if (want('php')) await genPhp();
if (target === 'all') {
  const links = packages.map(pkg => `- [${pkg}](./${pkg}/index.md)`).join('\n');
  writeFileSync(join(API_DIR, 'index.md'),
    '# API reference\n\nGenerate with `make docs-api`.\n\n' + links +
    '\n- [Go](./go.md)\n- [Rust](./rust.md)\n- [PHP](./php.md)\n');
}
lines.close(`gen-api-docs ${target}`);
process.stdout.write(`[gen-api-docs] ${target}: complete\n`);
