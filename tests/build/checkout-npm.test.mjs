// The npm of the checkout (scripts/checkout-npm.mjs, scripts/install-npm.mjs): the recorded release is installed into
// .tools/npm of the checkout and never into the machine, and make, the scripts and CI put its commands first on PATH.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { NPM_BIN, npmBin, toolPath } from '../../scripts/checkout-npm.mjs';
import { installNpm, recordedNpm } from '../../scripts/install-npm.mjs';
import { makeTargets } from '../../scripts/test-commands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// An npm command that records its arguments and, for `install --prefix <p> npm@<v>`, installs a stub npm <v> there.
// macOS may spend a long time on the first execution of a newly written executable (C7.13); each case logs the
// elapsed time of the call that first executes its stub, so a stall explains itself.
function logFirstExecution(name, started) {
  process.stderr.write(`[stub] the first execution of ${name} ended in ${Math.round(performance.now() - started)} ms\n`);
}

function stubNpm(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-npm-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'calls.log');
  const program = path.join(directory, 'npm');
  writeFileSync(program, `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
[ "$1" = install ] && [ "$2" = --prefix ] || exit 3
prefix=$3
for argument in "$@"; do case $argument in npm@*) version=\${argument#npm@};; esac; done
mkdir -p "$prefix/node_modules/npm" "$prefix/node_modules/.bin"
printf '{"name":"npm","version":"%s"}\\n' "$version" > "$prefix/node_modules/npm/package.json"
printf '#!/bin/sh\\necho %s\\n' "$version" > "$prefix/node_modules/.bin/npm"
chmod 755 "$prefix/node_modules/.bin/npm"
`, { mode: 0o755 });
  return { program, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []), directory };
}

test('install-npm installs the recorded npm into .tools/npm of the checkout and keeps an installed release', async t => {
  const npm = stubNpm(t);
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-checkout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const printed = [];
  const started = performance.now();
  const first = await installNpm({ root, recorded: '12.2.0', npm: npm.program, print: line => printed.push(line) });
  logFirstExecution(npm.program, started);
  assert.deepEqual(first, { installed: true, release: '12.2.0' });
  const [call] = npm.calls();
  assert.match(call, /^install --prefix \S+\/\.tools\/npm\.next-\S+ --no-audit --no-fund npm@12\.2\.0$/);
  assert.equal(spawnSync(path.join(npmBin(root), 'npm'), ['--version'], { encoding: 'utf8' }).stdout.trim(), '12.2.0');
  // No temporary directory is left beside the installation.
  assert.deepEqual(readdirSync(path.join(root, '.tools')), ['npm']);
  assert.match(printed.at(-1), /installed 12\.2\.0 in \.tools\/npm/);

  const second = await installNpm({ root, recorded: '12.2.0', npm: npm.program });
  assert.deepEqual(second, { installed: false, release: '12.2.0' });
  assert.equal(npm.calls().length, 1, 'an installed recorded release is kept');

  const other = await installNpm({ root, recorded: '12.3.0', npm: npm.program });
  assert.deepEqual(other, { installed: true, release: '12.3.0' });
  assert.equal(spawnSync(path.join(npmBin(root), 'npm'), ['--version'], { encoding: 'utf8' }).stdout.trim(), '12.3.0');
  assert.deepEqual(readdirSync(path.join(root, '.tools')), ['npm']);
});

test('install-npm fails with the expected and the installed release', async t => {
  const npm = stubNpm(t);
  writeFileSync(npm.program, readFileSync(npm.program, 'utf8').replace('version=${argument#npm@}', 'version=11.0.0'));
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-checkout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const started = performance.now();
  await assert.rejects(installNpm({ root, recorded: '12.2.0', npm: npm.program }), /holds npm 11\.0\.0 and its command prints 11\.0\.0; expected 12\.2\.0/);
  logFirstExecution(npm.program, started);
  assert.equal(existsSync(path.join(root, '.tools', 'npm')), false);
  assert.deepEqual(readdirSync(path.join(root, '.tools')), []);
});

// A container image is a machine of its own, so its definition may install npm globally; the scripts, make and CI run
// on the machine of the checkout.
test('no script, make target or CI step installs npm into the machine', () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts', 'Makefile', '.github'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const violations = [];
  for (const file of files) {
    if (!existsSync(path.join(ROOT, file))) continue;
    readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
      if (/\bnpm (?:i|install)\b[^\n]*(?:\s-g\b|--global\b)|\bnpm\b[^\n]*'(?:--global|-g)'/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, []);
});

test('toolPath puts the checkout npm first once', () => {
  assert.equal(toolPath(['/usr/bin', NPM_BIN, '/bin'].join(path.delimiter)), [NPM_BIN, '/usr/bin', '/bin'].join(path.delimiter));
  assert.equal(toolPath(''), NPM_BIN);
});

test('make runs with the checkout npm first on PATH', () => {
  const run = spawnSync('make', ['--no-print-directory', '-s', '-f', 'Makefile', '-f', '-', 'print-path'], {
    cwd: ROOT, encoding: 'utf8', input: 'print-path:\n\t@echo "$$PATH"\n', env: { ...process.env, MAKEFLAGS: '', MAKELEVEL: '' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim().split(path.delimiter)[0], NPM_BIN);
});

// GNU Make 3.81 looks up the program of a recipe line without shell syntax on the PATH that make started with, so a
// recipe line `npm ci` would start the npm of the machine; every recipe starts npm as $(NPM), the path in the checkout.
test('every recipe starts npm by its path in the checkout', () => {
  const violations = [];
  for (const [target, rule] of Object.entries(makeTargets(readFileSync(path.join(ROOT, 'Makefile'), 'utf8')))) {
    for (const command of rule.commands) {
      for (const segment of command.split(/&&|\|\||[;|]/)) {
        if (/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*(?:npm|npx)\b/.test(segment.trim())) violations.push(`${target}: ${segment.trim()}`);
      }
    }
  }
  assert.deepEqual(violations, [], 'start npm as $(NPM) in a recipe');
});

test('a recipe of make runs the recorded npm of the checkout', () => {
  const recorded = recordedNpm(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
  // The probe recipe has no shell syntax, so make starts the program itself, as it does for `$(NPM) run docs:api`.
  const run = spawnSync('make', ['--no-print-directory', '-s', '-f', 'Makefile', '-f', '-', 'probe-npm'], {
    cwd: ROOT, encoding: 'utf8', input: 'probe-npm:\n\t$(NPM) --version\n', env: { ...process.env, MAKEFLAGS: '', MAKELEVEL: '' },
  });
  assert.equal(run.status, 0, `${run.stderr}\nfix: node scripts/install-npm.mjs`);
  assert.equal(run.stdout.trim(), recorded);
});

test('every script that starts npm puts the checkout npm first', () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts/*.mjs', 'scripts/**/*.mjs'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(file => file && !file.endsWith('.test.mjs'));
  const violations = [];
  for (const file of files) {
    if (!existsSync(path.join(ROOT, file))) continue;
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    const starts = /(?:runCommand|run|spawn|spawnSync|execFile|execFileSync)\(\s*(?:\{\s*command:\s*)?'npm'/.test(source);
    if (starts && !/\buseCheckoutNpm\(\)/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, [], 'call useCheckoutNpm() of scripts/checkout-npm.mjs before starting npm');
});

test('every CI job puts the checkout npm on GITHUB_PATH before its first npm command', () => {
  const directory = path.join(ROOT, '.github/workflows');
  const violations = [];
  for (const file of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = parse(readFileSync(path.join(directory, file), 'utf8'));
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      let onPath = false;
      for (const step of job.steps ?? []) {
        if (typeof step.run !== 'string') continue;
        const commands = step.run.split(/\n|&&/).map(text => text.trim()).filter(Boolean);
        for (const command of commands) {
          if (/^(?:npm|npx)\b/.test(command) && !onPath) violations.push(`${file} ${id}: \`${command}\` runs before .tools/npm/node_modules/.bin is on GITHUB_PATH`);
        }
        if (commands.includes('node scripts/install-npm.mjs') && commands.includes('echo "$PWD/.tools/npm/node_modules/.bin" >> "$GITHUB_PATH"')) onPath = true;
      }
    }
  }
  assert.deepEqual(violations, []);
});
