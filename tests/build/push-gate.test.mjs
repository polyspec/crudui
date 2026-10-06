// Tests the push check (`scripts/push-gate.mjs`): the tracked pre-push hook .githooks/pre-push refuses a push while the
// checklist of a pushed commit or of the working tree has a task in progress, and also when it cannot read a pushed
// checklist; `make` installs the hook, `hooks-check` fails while it is not installed; the CI command `commit <sha>`
// fails for a commit with a task in progress or without the executable hook. Each of these cases pushes to a temporary
// bare repository from a temporary checkout that holds the push check, the guard, the Makefile and the hook of this
// checkout. The step of the job `push-gate` also runs `make records-check`, and the last case runs that step in a copy
// of this checkout without its ignored files, so it fails a checklist that breaks the document rules with Node.js alone.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeDryRun } from './make-dry-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHECKLIST = 'docs/plans/execution-checklist.md';
const FILES = ['Makefile', 'scripts/full-run.mjs', 'scripts/push-gate.mjs', 'scripts/holder-lock.mjs', 'scripts/check-toolchain.mjs', 'scripts/checkout-npm.mjs', 'scripts/test-progress/progress.mjs', '.githooks/pre-push'];

const ACTIVE = `# Execution checklist

| ID | Task | Verification | Status |
|---|---|---|---|
| C1.1 | Write the parser | \`make test-ts\` | [o] |
| C1.2 | Print \`a \\| b\` for a union | \`make test-ts\` | [~] |
| C1.3 | Remove the old runner | \`make test-scripts\` | [!] cause: blocked; retry: C1.2 done |
`;
const DONE = ACTIVE.replace('| [~] |', '| [o] |');

// Git without the user's global and system settings, so core.hooksPath comes from the checkout alone.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' };

const run = (cwd, program, ...args) => spawnSync(program, args, { cwd, env: ENV, encoding: 'utf8' });

function git(cwd, ...args) {
  const result = run(cwd, 'git', ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// A checkout with the files of the push check and a committed checklist, its hook installed, and an empty bare remote.
function checkout(t, checklist) {
  const base = mkdtempSync(path.join(tmpdir(), 'crudui-push-gate-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const directory = path.join(base, 'checkout');
  const remote = path.join(base, 'remote.git');
  for (const file of FILES) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  chmodSync(path.join(directory, '.githooks/pre-push'), 0o755);
  mkdirSync(path.join(directory, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(directory, CHECKLIST), checklist);
  git(directory, 'init', '--quiet', '--initial-branch=main');
  git(directory, 'config', 'core.hooksPath', '.githooks');
  git(directory, 'add', '.');
  git(directory, 'commit', '--quiet', '-m', 'checklist');
  git(base, 'init', '--quiet', '--bare', remote);
  git(directory, 'remote', 'add', 'origin', remote);
  return { directory, remote };
}

function commit(directory, file, text) {
  writeFileSync(path.join(directory, file), text);
  git(directory, 'add', file);
  git(directory, 'commit', '--quiet', '-m', file);
  return git(directory, 'rev-parse', 'HEAD');
}

const push = directory => run(directory, 'git', 'push', 'origin', 'main');
const remoteMain = remote => run(remote, 'git', 'rev-parse', '--verify', '--quiet', 'refs/heads/main').stdout.trim();
const check = (directory, ...args) => run(directory, 'node', 'scripts/push-gate.mjs', ...args);

test('R1: a push whose commit has a task in progress is refused with its ID, title, reason and remedy', t => {
  const { directory, remote } = checkout(t, ACTIVE);
  const head = git(directory, 'rev-parse', '--short', 'HEAD');
  const result = push(directory);
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /push refused: checklist tasks are in progress \(docs\/plans\/execution-checklist\.md\)/);
  assert.match(result.stderr, new RegExp(`refs/heads/main ${head}: C1\\.2 Print \`a \\\\\\| b\` for a union`));
  assert.match(result.stderr, /working tree: C1\.2 /);
  assert.match(result.stderr, /A push happens only when no checklist task is \[~\] \(AGENTS\.md\)/);
  assert.match(result.stderr, /Complete each task \(\[o\] with its changelog entry, committed\), or mark it \[!\]/);
  assert.doesNotMatch(result.stderr, /no-verify/);
  assert.equal(remoteMain(remote), '');
});

test('G1: a push without a task in progress reaches the remote', t => {
  const { directory, remote } = checkout(t, DONE);
  const result = push(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(remoteMain(remote), git(directory, 'rev-parse', 'HEAD'));
});

test('R2: a task in progress in the working tree refuses a push of commits without one', t => {
  const { directory, remote } = checkout(t, DONE);
  writeFileSync(path.join(directory, CHECKLIST), ACTIVE);
  const result = push(directory);
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /working tree: C1\.2 Print/);
  assert.doesNotMatch(result.stderr, /refs\/heads\/main [0-9a-f]+: C1\.2/);
  assert.equal(remoteMain(remote), '');
});

test('R3: hooks-check fails while the hook is not installed, and make installs it', t => {
  const { directory } = checkout(t, DONE);
  git(directory, 'config', '--unset', 'core.hooksPath');
  const missing = check(directory, 'hooks-check');
  assert.equal(missing.status, 1, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /core\.hooksPath is unset, not \.githooks[\s\S]*make hooks/);

  // Any make run installs the hook while it reads the Makefile.
  const dry = makeDryRun(directory, 'help', { env: ENV });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(git(directory, 'config', 'core.hooksPath'), '.githooks');

  git(directory, 'config', 'core.hooksPath', 'elsewhere');
  const hooks = run(directory, 'make', 'hooks');
  assert.equal(hooks.status, 0, hooks.stdout + hooks.stderr);
  assert.equal(check(directory, 'hooks-check').status, 0);

  chmodSync(path.join(directory, '.githooks/pre-push'), 0o644);
  const plain = check(directory, 'hooks-check');
  assert.equal(plain.status, 1);
  assert.match(plain.stderr, /\.githooks\/pre-push is not an executable file/);
});

test('R4: a pushed commit without the checklist is refused', t => {
  const { directory, remote } = checkout(t, DONE);
  git(directory, 'rm', '--quiet', '--cached', CHECKLIST);
  git(directory, 'commit', '--quiet', '-m', 'drop the checklist');
  const result = push(directory);
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /push refused: refs\/heads\/main [0-9a-f]+ has no docs\/plans\/execution-checklist\.md/);
  assert.equal(remoteMain(remote), '');
});

test('the hook input names the pushed commits; a deleted ref has none', () => {
  // Imported here so that a missing push check fails only these cases.
  return import('../../scripts/push-gate.mjs').then(({ pushedCommits }) => {
    const zero = '0'.repeat(40);
    assert.deepEqual(pushedCommits(`refs/heads/main ${'a'.repeat(40)} refs/heads/main ${zero}\nrefs/heads/old ${zero} refs/heads/old ${'b'.repeat(40)}\n`),
      [{ ref: 'refs/heads/main', sha: 'a'.repeat(40) }]);
  });
});

test('CI: commit <sha> fails for a task in progress or a missing hook and passes a clean commit', t => {
  const { directory } = checkout(t, ACTIVE);
  const summary = path.join(directory, '..', 'summary.md');
  const active = run(directory, 'node', 'scripts/push-gate.mjs', 'commit', 'HEAD');
  assert.equal(active.status, 1, active.stdout + active.stderr);
  assert.match(active.stdout, /^::error::push refused: checklist tasks are in progress/m);
  assert.match(active.stdout, /^::error:: {2}[0-9a-f]+: C1\.2 Print/m);

  const clean = commit(directory, CHECKLIST, DONE);
  const withSummary = spawnSync('node', ['scripts/push-gate.mjs', 'commit', clean], { cwd: directory, env: { ...ENV, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
  assert.equal(withSummary.status, 0, withSummary.stdout + withSummary.stderr);
  assert.doesNotMatch(withSummary.stdout, /::error::/);

  git(directory, 'update-index', '--chmod=-x', '.githooks/pre-push');
  git(directory, 'commit', '--quiet', '-m', 'plain hook');
  const plain = spawnSync('node', ['scripts/push-gate.mjs', 'commit', 'HEAD'], { cwd: directory, env: { ...ENV, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
  assert.equal(plain.status, 1, plain.stdout);
  assert.match(plain.stdout, /^::error::.*does not track \.githooks\/pre-push as an executable file \(mode 100755\)/m);
  assert.match(readFileSync(summary, 'utf8'), /does not track \.githooks\/pre-push/);

  git(directory, 'rm', '--quiet', '--cached', '.githooks/pre-push');
  git(directory, 'commit', '--quiet', '-m', 'no hook');
  const none = run(directory, 'node', 'scripts/push-gate.mjs', 'commit', 'HEAD');
  assert.equal(none.status, 1, none.stdout);
  assert.match(none.stdout, /does not track \.githooks\/pre-push/);
});

// The step of the job `push-gate` that runs its checks: `make ci-targets TARGETS="..."`.
function pushGateStep() {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/push-gate.yml'), 'utf8');
  const steps = [...workflow.matchAll(/^ {8}run: (make ci-targets TARGETS="[^"]+")$/gm)].map(match => match[1]);
  assert.equal(steps.length, 1, `the job push-gate runs ${steps.length} make ci-targets steps`);
  return steps[0];
}

// A copy of the tracked and new files of this checkout, committed into a repository of its own, without the ignored
// files: no node_modules, no .tools, as the job `push-gate` checks out a commit and installs nothing.
function copyOfCheckout(t) {
  const base = mkdtempSync(path.join(tmpdir(), 'crudui-push-gate-records-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    let source;
    try {
      source = readFileSync(path.join(ROOT, file));
    } catch (cause) {
      if (cause.code === 'ENOENT') continue; // deleted in the working tree
      throw cause;
    }
    mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    writeFileSync(path.join(base, file), source);
  }
  chmodSync(path.join(base, '.githooks/pre-push'), 0o755);
  git(base, 'init', '--quiet', '--initial-branch=main');
  git(base, 'config', 'core.hooksPath', '.githooks');
  git(base, 'add', '.');
  git(base, 'commit', '--quiet', '-m', 'copy');
  return base;
}

test('the job push-gate fails a commit whose checklist breaks the document rules, with Node.js alone', t => {
  const directory = copyOfCheckout(t);
  const step = pushGateStep();
  const clean = run(directory, 'sh', '-c', step);
  assert.equal(clean.status, 0, `${step}\n${clean.stdout}${clean.stderr}`);

  // A marker outside a task state: no task is [~], so the check of tasks passes and the document rules fail.
  for (const file of [CHECKLIST, CHECKLIST.replace(/\.md$/, '.ko.md')]) {
    writeFileSync(path.join(directory, file), `${readFileSync(path.join(directory, file), 'utf8')}| C99.1 | Write [x] the printer | \`make test-ts\` | [ ] |\n`);
  }
  git(directory, 'commit', '--quiet', '-am', 'broken marker');
  const broken = run(directory, 'sh', '-c', step);
  assert.notEqual(broken.status, 0, `${step} passed a broken checklist\n${broken.stdout}`);
  assert.match(broken.stdout + broken.stderr, /execution-checklist\.md:\d+:\d+: state marker \[x\] outside a task state/);
  assert.match(readFileSync(path.join(directory, 'var/report/ci-targets/summary.md'), 'utf8'), /records-check \| failed/);
});
