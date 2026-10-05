// Tests the owner checks of changed paths (scripts/owner-check.mjs and scripts/owner-checks.json): a path selects
// exactly the checks that the declaration names for it, a tracked or new path without an owner and a glob without a path
// fail with their names, a removed path that no rule owns selects nothing and a removed test file is not run, a check
// that reads a path no rule of it selects fails, and the declaration of this repository owns every tracked path. The
// fixture cases run a copy of the script in a temporary Git repository whose checks only print their names.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/owner-check.mjs';

const MAKEFILE = `docs-check:
\t@echo "ran docs-check"
unit:
\t@echo "ran unit"
aggregate: unit
ci:
\tnode scripts/full-run.mjs run 'make unit'
`;

const PACKAGE = { name: 'fixture', private: true, scripts: { 'test:forms': 'echo ran test:forms' } };

const OWNERS = {
  owners: [
    { paths: ['docs/**', '*.md'], targets: ['docs-check'] },
    { paths: ['src/**', 'Makefile', 'package.json', 'scripts/**'], targets: ['unit'] },
    { paths: ['forms/**'], scripts: ['test:forms'] },
  ],
};

function git(directory, ...args) {
  const run = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

// A committed repository with the script, the Makefile, the declaration `owners` and the files `files`.
function repository(t, owners, files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-owner-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'scripts'));
  for (const script of [SCRIPT, 'scripts/checkout-npm.mjs']) copyFileSync(path.join(ROOT, script), path.join(directory, script));
  writeFileSync(path.join(directory, 'Makefile'), MAKEFILE);
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify(PACKAGE));
  writeFileSync(path.join(directory, 'scripts/owner-checks.json'), JSON.stringify(owners));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), text);
  }
  git(directory, 'init', '--quiet');
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'fixture');
  const env = { ...process.env, MAKEFLAGS: '', MAKELEVEL: '' };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: directory, encoding: 'utf8', env });
  run.directory = directory;
  return run;
}

const FILES = { 'README.md': '# Fixture\n', 'docs/index.md': '# Index\n', 'src/main.txt': 'main\n', 'forms/a.yml': 'a: 1\n' };

test('a changed path runs exactly the checks of its rules', (t) => {
  const run = repository(t, OWNERS, FILES)('--paths', 'docs/index.md forms/a.yml');
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^\[owner-check\] docs\/index\.md -> make docs-check$/m);
  assert.match(run.stdout, /^\[owner-check\] forms\/a\.yml -> npm run test:forms$/m);
  assert.deepEqual(run.stdout.match(/^ran .*$/gm), ['ran docs-check', 'ran test:forms']);
});

test('every selected check runs after an earlier one failed', (t) => {
  const check = repository(t, OWNERS, FILES);
  writeFileSync(path.join(check.directory, 'Makefile'), MAKEFILE.replace('\t@echo "ran docs-check"', '\t@echo "ran docs-check"; exit 3'));
  const run = check('--paths', 'docs/index.md forms/a.yml');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /ran test:forms/);
  assert.match(run.stdout, /^\[owner-check\] failed: make docs-check$/m);
});

test('a tracked path without an owner fails with its name before any check runs', (t) => {
  const owners = { owners: OWNERS.owners.filter(rule => !rule.paths.includes('src/**')).concat([{ paths: ['Makefile', 'package.json', 'scripts/**'], targets: ['unit'] }]) };
  const run = repository(t, owners, FILES)('--paths', 'docs/index.md');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /^\[owner-check\] src\/main\.txt: the path matches no owner in scripts\/owner-checks\.json$/m);
  assert.equal(run.stdout.match(/^ran /m), null, run.stdout);
});

test('a new path without an owner fails with its name', (t) => {
  const check = repository(t, OWNERS, FILES);
  mkdirSync(path.join(check.directory, 'notes'));
  writeFileSync(path.join(check.directory, 'notes/new.txt'), 'new\n');
  const run = check();
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /^\[owner-check\] notes\/new\.txt: the path matches no owner in scripts\/owner-checks\.json$/m);
});

test('a removed path that no rule owns selects nothing, and a removed test file is not run', (t) => {
  const owners = { owners: [...OWNERS.owners, { paths: ['tests/*.test.mjs'], tests: ['$path'] }] };
  const run = repository(t, owners, { ...FILES, 'tests/kept.test.mjs': '' })('--dry-run', '--paths', 'notes/removed.txt tests/removed.test.mjs');
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^\[owner-check\] notes\/removed\.txt -> nothing: the path was removed and no rule owns it$/m);
  assert.match(run.stdout, /^\[owner-check\] tests\/removed\.test\.mjs -> $/m);
  assert.match(run.stdout, /^\[owner-check\] 2 changed paths select nothing$/m);
});

test('a glob without a path, a full-suite target, an unknown script and a missing test fail with their names', (t) => {
  const owners = { owners: [...OWNERS.owners, { paths: ['schema/**'], targets: ['ci'] }, { paths: ['docs/**'], targets: ['ci'], scripts: ['test:missing'], tests: ['tests/missing.test.mjs'] }] };
  const run = repository(t, owners, FILES)('--validate');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /the glob schema\/\*\* matches no tracked path/);
  assert.match(run.stderr, /the target ci runs the full suite, which an owner check never runs/);
  assert.match(run.stderr, /the script test:missing of docs\/\*\* is not a script of package\.json/);
  assert.match(run.stderr, /the test tests\/missing\.test\.mjs of docs\/\*\* does not exist/);
});

test('a declared input of a check fails the validation when no rule of the path selects that check', (t) => {
  const owners = { ...OWNERS, inputs: { 'make unit': ['src/**', 'docs/**'], 'npm run test:forms': ['forms/**'], 'make missing': ['src/**'], 'make aggregate': ['nothing/**'] } };
  const run = repository(t, owners, FILES)('--validate');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /^\[owner-check\] docs\/index\.md: an input of make unit, which no owner rule of the path selects$/m);
  assert.match(run.stderr, /^\[owner-check\] scripts\/owner-checks\.json: the inputs of make missing name no make target, npm script, workspace or package directory$/m);
  assert.match(run.stderr, /^\[owner-check\] scripts\/owner-checks\.json: the input glob nothing\/\*\* of make aggregate matches no tracked path$/m);
  assert.doesNotMatch(run.stderr, /src\/main\.txt: an input of make unit/);
  assert.doesNotMatch(run.stderr, /an input of npm run test:forms/);
});

test('a rule that selects a target which runs another as a prerequisite selects the inputs of that target', (t) => {
  const owners = { owners: [...OWNERS.owners.filter(rule => !rule.paths.includes('src/**')), { paths: ['src/**', 'Makefile', 'package.json', 'scripts/**'], targets: ['aggregate'] }], inputs: { 'make unit': ['src/**'] } };
  const run = repository(t, owners, FILES)('--validate');
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('the declaration of this repository owns every path and selects the document check for a document', () => {
  const validate = spawnSync(process.execPath, [SCRIPT, '--validate'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);
  const run = spawnSync(process.execPath, [SCRIPT, '--dry-run', '--paths', 'docs/index.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^\[owner-check\] 1 changed paths select make docs-check; node tests tests\/build\/test-commands\.test\.mjs$/m);
});
