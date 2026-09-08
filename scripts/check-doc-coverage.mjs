#!/usr/bin/env node
/**
 * check-doc-coverage.mjs — doc-coverage gate (RED/GREEN) across 4 languages.
 *
 * Fails (non-zero exit) if any public API symbol lacks a doc comment. This is a
 * pure check; it is idempotent by nature and produces no artifacts.
 *
 *   - TypeScript: typedoc validation.notDocumented + treatValidationWarningsAsErrors
 *     over the 4 TS packages (scripts/typedoc.check.json).
 *   - Go: `go test ./validator/... -run Test.*DocCoverage` (go/ast based, no extra deps).
 *   - Rust: `cargo build` with `#![deny(missing_docs)]` in the lib/bin crates.
 *   - PHP: `phpunit` DocCoverageTest (docblock presence on public classes/methods).
 *
 * Usage: node scripts/check-doc-coverage.mjs [all|ts|go|rust|php]
 */
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || 'all').toLowerCase();
const want = (name) => target === 'all' || target === name;

const results = [];
function record(lang, ok, note) {
  results.push({ lang, ok, note });
  process.stdout.write(`[doc-coverage] ${lang}: ${ok ? 'GREEN' : 'RED'}${note ? ' — ' + note : ''}\n`);
}

const TS_PACKAGES = [
  { pkg: 'generator-core', entry: 'src/index.ts', tsconfig: 'packages/generator-core/tsconfig.json' },
  { pkg: 'validator-ts', entry: 'src/index.ts', tsconfig: 'packages/validator-ts/tsconfig.json' },
  { pkg: 'generator-react', entry: 'src/index.ts', tsconfig: 'packages/generator-react/tsconfig.json' },
  { pkg: 'generator-vue', entry: 'src/index.ts', tsconfig: 'packages/generator-vue/tsconfig.json' },
  {
    pkg: 'generator-svelte',
    entry: 'src/legacy/render.ts',
    extraEntries: ['src/legacy/fieldHtml.ts', 'src/legacy/i18n.ts', 'src/legacy/legacyDisplay.ts', 'src/legacy/legacyLang.ts', 'src/legacy/utils.ts'],
    tsconfig: 'scripts/tsconfig.svelte-docs.json',
  },
];

function checkTS() {
  for (const p of TS_PACKAGES) {
    const pkgDir = join(ROOT, 'packages', p.pkg);
    const entries = [join(pkgDir, p.entry), ...(p.extraEntries || []).map((e) => join(pkgDir, e))];
    const args = [
      'typedoc',
      '--options', join(ROOT, 'scripts', 'typedoc.check.json'),
      '--tsconfig', join(ROOT, p.tsconfig),
      '--entryPointStrategy', 'expand',
      ...entries,
    ];
    try {
      execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
      record(`ts:${p.pkg}`, true);
    } catch {
      record(`ts:${p.pkg}`, false, 'undocumented public exports (see typedoc warnings above)');
    }
  }
}

function checkGo() {
  const goDir = join(ROOT, 'packages', 'validator-go');
  try {
    execSync('go test ./validator/... -run Test.*DocCoverage -count=1', { cwd: goDir, stdio: 'inherit' });
    record('go', true);
  } catch {
    record('go', false, 'undocumented exported declarations (see go test output above)');
  }
}

function checkRust() {
  const rustDir = join(ROOT, 'packages', 'validator-rust');
  const cargoBin = join(process.env.HOME || '', '.cargo', 'bin');
  const env = { ...process.env, PATH: `${cargoBin}:${process.env.PATH || ''}` };
  try {
    // #![deny(missing_docs)] turns undocumented pub items into compile errors.
    execSync('cargo build --lib', { cwd: rustDir, env, stdio: 'inherit' });
    record('rust', true);
  } catch {
    record('rust', false, 'missing_docs on public items (see cargo output above)');
  }
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkPHP() {
  const phpDir = join(ROOT, 'packages', 'validator-php');
  const phpunit = join(phpDir, 'vendor', 'bin', 'phpunit');
  if (!commandExists('php')) {
    record('php', true, 'SKIP: php not installed');
    return;
  }
  if (!existsSync(phpunit)) {
    // fall back to the standalone checker if phpunit deps are not installed
    try {
      execSync(`php ${JSON.stringify(join(ROOT, 'scripts', 'php-doc-coverage.php'))}`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
      record('php', true, '(standalone checker; phpunit vendor not installed)');
    } catch {
      record('php', false, 'undocumented public class/method (standalone checker)');
    }
    return;
  }
  try {
    execSync(`${JSON.stringify(phpunit)} --filter DocCoverage`, { cwd: phpDir, stdio: 'inherit' });
    record('php', true);
  } catch {
    record('php', false, 'undocumented public class/method (DocCoverageTest)');
  }
}

if (want('ts')) checkTS();
if (want('go')) checkGo();
if (want('rust')) checkRust();
if (want('php')) checkPHP();

const failed = results.filter((r) => !r.ok);
process.stdout.write('\n[doc-coverage] summary:\n');
for (const r of results) {
  process.stdout.write(`  ${r.ok ? 'GREEN' : 'RED  '} ${r.lang}${r.note ? ' (' + r.note + ')' : ''}\n`);
}
if (failed.length > 0) {
  process.stdout.write(`\n[doc-coverage] FAILED: ${failed.length} language(s) RED\n`);
  process.exit(1);
}
process.stdout.write('\n[doc-coverage] all GREEN\n');
