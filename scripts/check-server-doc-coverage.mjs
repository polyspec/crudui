#!/usr/bin/env node
/**
 * Check documentation coverage for the examples/* API servers. The library
 * checker covers packages/*; this checker covers the four example backends.
 *
 * It fails (non-zero exit) if any server function / route handler lacks a
 * preceding doc comment. It is a pure check: idempotent by nature, no artifacts.
 *
 *   - node-api (examples/legacy/node-api/server.js): a light regex/line parser
 *     requires a comment directly above every `function NAME(` declaration and
 *     every Express handler registration (app.get/post/put/delete/patch/use/
 *     all/options).
 *   - go-api (examples/legacy/go-api): `go test -run TestDocCoverage` (go/ast based)
 *     requires a doc comment on every func declaration.
 *   - php-api (examples/legacy/php-api/{api,validate,index}.php): the standalone
 *     php-server-doc-coverage.php tokenizer requires a docblock above every
 *     named function.
 *   - rust-api (examples/legacy/rust-api/src/main.rs): a line parser requires a `///`
 *     doc comment directly above every `fn` declaration. (`main.rs` is a bin
 *     crate, so #![deny(missing_docs)] only reaches pub items — it cannot cover
 *     these private functions, so this script checks them directly.)
 *
 * Usage: node scripts/check-server-doc-coverage.mjs [all|node|go|php|rust]
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || 'all').toLowerCase();
const want = (name) => target === 'all' || target === name;

const results = [];
function record(targetName, ok, note) {
  results.push({ targetName, ok, note });
  process.stdout.write(`[server-doc-coverage] ${targetName}: ${ok ? 'PASS' : 'FAIL'}${note ? ' — ' + note : ''}\n`);
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Report whether the physical line above index `i` is a comment line. A comment
 * is a line-comment, a block-comment terminator, or a block-comment
 * continuation line (leading star). Blank lines between the declaration and its
 * comment are not allowed (the comment must sit directly above), matching the
 * convention the servers already follow.
 */
function lineAboveIsComment(lines, i) {
  if (i <= 0) return false;
  const prev = lines[i - 1].trim();
  return prev.startsWith('//') || prev.startsWith('*/') || prev.startsWith('*') || prev.startsWith('/*');
}

/** Check that every node-api function and Express handler has a preceding comment. */
function checkNode() {
  const file = join(ROOT, 'examples', 'legacy', 'node-api', 'server.js');
  if (!existsSync(file)) {
    record('node', false, 'examples/legacy/node-api/server.js not found');
    return;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  // Named function declarations, and Express route/middleware registrations.
  const fnRe = /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
  const handlerRe = /^\s*app\.(get|post|put|delete|patch|use|all|options)\s*\(/;
  const gaps = [];
  for (let i = 0; i < lines.length; i++) {
    const fnM = fnRe.exec(lines[i]);
    const hM = handlerRe.exec(lines[i]);
    if (!fnM && !hM) continue;
    if (!lineAboveIsComment(lines, i)) {
      const label = fnM ? 'function ' + fnM[1] + '()' : 'app.' + hM[1] + '(...)';
      gaps.push(`server.js:${i + 1}: ${label}`);
    }
  }
  if (gaps.length > 0) {
    process.stdout.write('  undocumented:\n    ' + gaps.join('\n    ') + '\n');
    record('node', false, `${gaps.length} undocumented function/handler(s)`);
  } else {
    record('node', true);
  }
}

/** Run the Go AST documentation check in examples/legacy/go-api. */
function checkGo() {
  const goDir = join(ROOT, 'examples', 'legacy', 'go-api');
  if (!commandExists('go')) {
    record('go', true, 'SKIP: go not installed');
    return;
  }
  try {
    execSync('go test ./... -run TestDocCoverage -count=1', { cwd: goDir, stdio: 'inherit' });
    record('go', true);
  } catch {
    record('go', false, 'undocumented func declarations (see go test output above)');
  }
}

/** Run the PHP tokenizer documentation check. */
function checkPHP() {
  if (!commandExists('php')) {
    record('php', true, 'SKIP: php not installed');
    return;
  }
  const checker = join(ROOT, 'scripts', 'php-server-doc-coverage.php');
  try {
    execSync(`php ${JSON.stringify(checker)}`, { cwd: ROOT, stdio: 'inherit' });
    record('php', true);
  } catch {
    record('php', false, 'undocumented php-api router function(s)');
  }
}

/** Check that every Rust function in src/main.rs has a preceding doc comment. */
function checkRust() {
  const file = join(ROOT, 'examples', 'legacy', 'rust-api', 'src', 'main.rs');
  if (!existsSync(file)) {
    record('rust', false, 'examples/legacy/rust-api/src/main.rs not found');
    return;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  // Top-level / impl fn declarations (allow pub, const, async, unsafe modifiers).
  const fnRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+|async\s+|unsafe\s+|extern\s+"[^"]*"\s+)*fn\s+([A-Za-z0-9_]+)\s*[(<]/;
  const gaps = [];
  for (let i = 0; i < lines.length; i++) {
    const m = fnRe.exec(lines[i]);
    if (!m) continue;
    // A doc comment for an fn is `///` (or `/** */`); a plain `//` is not a doc
    // comment in Rust, so require `///` specifically.
    const prev = i > 0 ? lines[i - 1].trim() : '';
    const hasDoc = prev.startsWith('///') || prev.startsWith('*/') || prev.startsWith('*');
    if (!hasDoc) {
      gaps.push(`main.rs:${i + 1}: fn ${m[1]}()`);
    }
  }
  if (gaps.length > 0) {
    process.stdout.write('  undocumented:\n    ' + gaps.join('\n    ') + '\n');
    record('rust', false, `${gaps.length} undocumented fn(s)`);
  } else {
    record('rust', true);
  }
}

if (want('node')) checkNode();
if (want('go')) checkGo();
if (want('php')) checkPHP();
if (want('rust')) checkRust();

const failed = results.filter((r) => !r.ok);
process.stdout.write('\n[server-doc-coverage] summary:\n');
for (const r of results) {
  process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.targetName}${r.note ? ' (' + r.note + ')' : ''}\n`);
}
if (failed.length > 0) {
  process.stdout.write(`\n[server-doc-coverage] FAILED: ${failed.length} target(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\n[server-doc-coverage] all targets passed\n');
