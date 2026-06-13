#!/usr/bin/env node
/**
 * gen-api-docs.mjs — multi-language API doc generator (idempotent).
 *
 * Emits, into docs/api/, markdown API references for:
 *   - TypeScript: validator-js, generator-react, generator-vue, generator-svelte
 *     (typedoc + typedoc-plugin-markdown, deterministic)
 *   - Go: validator-go (go doc -all captured to docs/api/go.md)
 *   - Rust: validator-rust (cargo doc --no-deps to target/doc; pointer note in docs/api/rust.md)
 *   - PHP: validator-php (phpDocumentor if available, else skip with a note)
 *
 * Idempotency: every TS package output dir and the captured go/rust/php pages are
 * wiped before regeneration. typedoc runs with disableGit so no commit hash, date,
 * or machine path leaks into output. Run `node scripts/gen-api-docs.mjs` any number
 * of times; output is byte-stable.
 */
import { execFileSync, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'docs', 'api');
const BASE_CONFIG = join(ROOT, 'scripts', 'typedoc.base.json');

// Single arg lets the Makefile / npm run a subset: all | ts | go | rust | php
const target = (process.argv[2] || 'all').toLowerCase();
const want = (name) => target === 'all' || target === name;

function log(msg) {
  process.stdout.write(`[gen-api-docs] ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`[gen-api-docs] WARNING: ${msg}\n`);
}

/** TypeScript packages: pkg dir name -> { entry, out, name } */
const TS_PACKAGES = [
  {
    pkg: 'validator-js',
    entry: 'src/index.ts',
    out: 'validator-js',
    title: '@form-spec/validator (validator-js)',
  },
  {
    pkg: 'generator-react',
    entry: 'src/index.ts',
    out: 'generator-react',
    title: '@form-spec/generator-react/legacy',
  },
  {
    pkg: 'generator-vue',
    entry: 'src/index.ts',
    out: 'generator-vue',
    title: '@form-spec/generator-vue/legacy',
  },
  {
    // svelte index.ts re-exports *.svelte which typedoc cannot parse; document the
    // framework-independent TypeScript helpers instead (render/fieldHtml/i18n/...).
    // The package ships no tsconfig.json, so a docs-only tsconfig under scripts/ is used.
    pkg: 'generator-svelte',
    entry: 'src/render.ts',
    extraEntries: ['src/fieldHtml.ts', 'src/i18n.ts', 'src/legacyDisplay.ts', 'src/legacyLang.ts', 'src/utils.ts'],
    out: 'generator-svelte',
    title: '@form-spec/generator-svelte (TypeScript helpers)',
    tsconfig: join(ROOT, 'scripts', 'tsconfig.svelte-docs.json'),
  },
];

function genTypeScript() {
  log('TypeScript: typedoc (markdown) for 4 packages');
  for (const p of TS_PACKAGES) {
    const pkgDir = join(ROOT, 'packages', p.pkg);
    const outDir = join(API_DIR, p.out);
    const entries = [join(pkgDir, p.entry), ...(p.extraEntries || []).map((e) => join(pkgDir, e))];

    // clean-then-generate
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const tsconfig = p.tsconfig || join(pkgDir, 'tsconfig.json');
    const args = [
      'typedoc',
      '--options', BASE_CONFIG,
      '--tsconfig', tsconfig,
      '--name', p.title,
      '--out', outDir,
      '--entryPointStrategy', 'expand',
      ...entries,
    ];
    try {
      execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
      log(`  -> ${p.out}: OK`);
    } catch (e) {
      warn(`typedoc failed for ${p.pkg}: ${e.message}`);
      // leave a placeholder so the VitePress sidebar link does not 404
      writeFileSync(
        join(outDir, 'README.md'),
        `# ${p.title}\n\n> typedoc generation failed in this environment. Run \`make docs-api\` after \`npm install\`.\n`,
      );
    }
  }
}

function genGo() {
  log('Go: go doc -all ./validator -> docs/api/go.md');
  const goPkgDir = join(ROOT, 'packages', 'validator-go');
  const outFile = join(API_DIR, 'go.md');
  rmSync(outFile, { force: true });
  let body;
  try {
    body = execSync('go doc -all ./validator', { cwd: goPkgDir, encoding: 'utf8' });
  } catch (e) {
    warn(`go doc failed: ${e.message}`);
    body = '> `go doc` failed in this environment.';
  }
  const md =
    '# Go API — validator-go\n\n' +
    'Module: `github.com/polyspec/crudui/packages/validator-go`\n\n' +
    'Captured from `go doc -all ./validator` (deterministic; no timestamps).\n\n' +
    '```text\n' +
    body.trimEnd() +
    '\n```\n';
  writeFileSync(outFile, md);
  log('  -> go.md: OK');
}

function genRust() {
  log('Rust: cargo doc --no-deps -p formspec-validator -> target/doc');
  const rustPkgDir = join(ROOT, 'packages', 'validator-rust');
  const outFile = join(API_DIR, 'rust.md');
  rmSync(outFile, { force: true });
  // cargo binary lives in ~/.cargo/bin which is not on PATH by default.
  const cargoBin = join(process.env.HOME || '', '.cargo', 'bin');
  const env = { ...process.env, PATH: `${cargoBin}:${process.env.PATH || ''}` };
  let ok = false;
  let docPath = '';
  try {
    // target dir is .gitignored; this is the HTML rustdoc output location
    execSync('cargo doc --no-deps -p formspec-validator', {
      cwd: rustPkgDir,
      env,
      stdio: 'inherit',
    });
    docPath = join(rustPkgDir, 'target', 'doc', 'formspec_validator', 'index.html');
    ok = existsSync(docPath);
  } catch (e) {
    warn(`cargo doc failed: ${e.message}`);
  }
  const rel = 'packages/validator-rust/target/doc/formspec_validator/index.html';
  const md =
    '# Rust API — formspec-validator\n\n' +
    'Crate: `formspec-validator`\n\n' +
    (ok
      ? 'Rustdoc HTML is generated by `cargo doc --no-deps -p formspec-validator` into\n' +
        `the (gitignored) \`target/doc\` tree:\n\n` +
        '```text\n' +
        rel +
        '\n```\n\n' +
        'Open that file in a browser, or run `make docs-api` then\n' +
        '`open ' + rel + '`.\n\n' +
        'The rustdoc output is not committed (large, HTML). This page is the stable\n' +
        'VitePress entry point that records where it lives.\n'
      : '> `cargo doc` did not produce output in this environment. Ensure cargo is on PATH\n' +
        '> (`~/.cargo/bin`) and re-run `make docs-api`.\n');
  writeFileSync(outFile, md);
  log(`  -> rust.md: OK${ok ? ' (rustdoc HTML present)' : ' (rustdoc HTML missing)'}`);
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function genPhp() {
  log('PHP: phpDocumentor (optional)');
  const phpPkgDir = join(ROOT, 'packages', 'validator-php');
  const outDir = join(API_DIR, 'php');
  const outFile = join(API_DIR, 'php.md');
  rmSync(outFile, { force: true });

  // Try phpDocumentor via: a project-local phar (tools/bin), then PATH binaries.
  let runner = null;
  const localPhar = join(ROOT, 'tools', 'bin', 'phpDocumentor.phar');
  if (existsSync(localPhar) && commandExists('php')) runner = `php ${JSON.stringify(localPhar)}`;
  else if (commandExists('phpDocumentor')) runner = 'phpDocumentor';
  else if (commandExists('phpdoc')) runner = 'phpdoc';

  if (!runner) {
    warn('phpDocumentor not installed; skipping PHP API HTML generation.');
    writeFileSync(
      outFile,
      '# PHP API — form-spec/validator\n\n' +
        'Package: `form-spec/validator` (namespace `FormSpec\\Validator`, PHP ^8.2)\n\n' +
        '> phpDocumentor is not installed in this environment, so HTML API docs were\n' +
        '> skipped. To generate them, install phpDocumentor (e.g.\n' +
        '> `composer global require phpdocumentor/phpdocumentor` or download the phar)\n' +
        '> and re-run `make docs-api`. Output will land in `docs/api/php/`.\n\n' +
        'The PHP validator mirrors the TypeScript `Validator` API; see the\n' +
        '[Validator API Reference](../API.md) for the cross-language contract.\n',
    );
    log('  -> php.md: SKIP note written');
    return;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const cacheDir = join(ROOT, 'tools', 'bin', '.phpdoc-cache');
  try {
    // phpDocumentor v3 CLI: run -d <src> -t <target>. Cache dir kept out of output
    // for idempotency (output tree must not carry run-specific cache artifacts).
    execSync(
      `${runner} run -d ${JSON.stringify(join(phpPkgDir, 'src'))} -t ${JSON.stringify(outDir)} ` +
        `--cache-folder ${JSON.stringify(cacheDir)} --title "form-spec/validator" --no-interaction`,
      { cwd: ROOT, stdio: 'inherit' },
    );
    // The cache dir is non-deterministic; never leave it inside the docs tree.
    rmSync(cacheDir, { recursive: true, force: true });
    writeFileSync(
      outFile,
      '# PHP API — form-spec/validator\n\n' +
        'Package: `form-spec/validator` (namespace `FormSpec\\Validator`, PHP ^8.2)\n\n' +
        'Generated by phpDocumentor into `docs/api/php/` (open `index.html`). HTML output\n' +
        'is gitignored (large); this page is the stable VitePress entry point.\n',
    );
    log('  -> php/: OK');
  } catch (e) {
    rmSync(cacheDir, { recursive: true, force: true });
    warn(`phpDocumentor run failed: ${e.message}`);
    writeFileSync(
      outFile,
      '# PHP API — form-spec/validator\n\n> phpDocumentor run failed in this environment.\n',
    );
  }
}

// ---- main ----
mkdirSync(API_DIR, { recursive: true });
if (want('ts')) genTypeScript();
if (want('go')) genGo();
if (want('rust')) genRust();
if (want('php')) genPhp();

// Write a stable index for docs/api so VitePress has an /api landing page.
if (target === 'all') {
  const tsLinks = TS_PACKAGES.map((p) => {
    const link = `./${p.out}/`;
    return `- [${p.title}](${link})`;
  }).join('\n');
  const index =
    '# API Reference (auto-generated)\n\n' +
    'Machine-generated API docs per language. Regenerate with `make docs-api`\n' +
    '(or `npm run docs:api`). This tree is idempotent: each run cleans and rewrites.\n\n' +
    '## TypeScript\n\n' +
    tsLinks +
    '\n\n## Go\n\n- [validator-go](./go.md)\n\n' +
    '## Rust\n\n- [formspec-validator](./rust.md)\n\n' +
    '## PHP\n\n- [form-spec/validator](./php.md)\n';
  writeFileSync(join(API_DIR, 'index.md'), index);
  log('Wrote docs/api/index.md');
}

log('done.');
