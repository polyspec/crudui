#!/usr/bin/env node
/** Generate public API references; a failed tool or missing output fails the command. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'docs/api');
const STATIC_API_DIR = join(ROOT, 'docs/public/api');
const target = process.argv[2] ?? 'all';
if (!['all', 'ts', 'go', 'rust', 'php'].includes(target)) {
  throw new Error('Use all, ts, go, rust or php');
}
const want = name => target === 'all' || target === name;
const packages = ['validator-ts', 'generator-core', 'generator-react', 'generator-vue', 'generator-svelte'];

function run(command, args, cwd = ROOT) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function requireOutput(path) {
  if (!existsSync(path)) throw new Error(`Documentation output is missing: ${path}`);
}

function cleanDirectory(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function genTypeScript() {
  run('npm', ['run', 'build']);
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
    run(join(ROOT, 'node_modules/.bin/typedoc'), args);
    requireOutput(join(output, 'index.md'));
  }
}

function genGo() {
  const output = join(API_DIR, 'go.md');
  rmSync(output, { force: true });
  const sections = [];
  for (const pkg of ['validator-go', 'generator-go']) {
    const options = { cwd: join(ROOT, 'packages', pkg), encoding: 'utf8' };
    const listed = execFileSync(process.env.GO ?? 'go', ['list', '-f', '{{if ne .Name "main"}}{{.ImportPath}}{{end}}', './...'], options).trim();
    if (!listed) throw new Error(`Go package list is empty: ${pkg}`);
    for (const name of listed.split('\n').filter(Boolean).sort()) {
      const body = execFileSync(process.env.GO ?? 'go', ['doc', '-all', name], options).trimEnd();
      if (!body) throw new Error(`Go documentation is empty: ${name}`);
      sections.push(`## ${name}\n\n\`\`\`text\n${body}\n\`\`\`\n`);
    }
  }
  writeFileSync(output, '# Go API\n\n' + sections.join('\n'));

}

function genRust() {
  const pkgDir = join(ROOT, 'packages/generator-rust');
  const generated = join(pkgDir, 'target/doc');
  const output = join(STATIC_API_DIR, 'rust');
  cleanDirectory(output);
  run(process.env.CARGO ?? 'cargo', ['doc', '--locked', '--no-deps', '-p', 'crudui-validator', '-p', 'crudui-generator'], pkgDir);
  requireOutput(join(generated, 'crudui_validator/index.html'));
  requireOutput(join(generated, 'crudui_generator/index.html'));
  cpSync(generated, output, { recursive: true });
  writeFileSync(join(API_DIR, 'rust.md'),
    '# Rust API\n\n- [Validator](/api/rust/crudui_validator/index.html)\n- [Generator](/api/rust/crudui_generator/index.html)\n');
}

function genPhp() {
  const phar = join(ROOT, 'tools/bin/phpDocumentor.phar');
  requireOutput(phar);
  const output = join(STATIC_API_DIR, 'php');
  const cache = join(ROOT, 'tools/bin/.phpdoc-cache');
  cleanDirectory(output);
  try {
    run(process.env.PHP ?? 'php', [phar, 'run', '-d', 'packages/validator-php/src', '-d', 'packages/generator-php/src', '-t', output,
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
if (want('ts')) genTypeScript();
if (want('go')) genGo();
if (want('rust')) genRust();
if (want('php')) genPhp();
if (target === 'all') {
  const links = packages.map(pkg => `- [${pkg}](./${pkg}/index.md)`).join('\n');
  writeFileSync(join(API_DIR, 'index.md'),
    '# API reference\n\nGenerate with `make docs-api`.\n\n' + links +
    '\n- [Go](./go.md)\n- [Rust](./rust.md)\n- [PHP](./php.md)\n');
}
process.stdout.write(`[gen-api-docs] ${target}: complete\n`);
