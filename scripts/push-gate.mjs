#!/usr/bin/env node
// The push check. A push happens only when no task of the checklist is `[~]` (AGENTS):
//
//   `node scripts/push-gate.mjs hook`           the pre-push hook `.githooks/pre-push`: reads the pushed refs from stdin
//   `node scripts/push-gate.mjs commit <rev>`   the job `push-gate` of `.github/workflows/push-gate.yml`
//   `node scripts/push-gate.mjs hooks-check`    fails while the pre-push hook is not installed in this checkout
//
// `hook` reads the checklist of every pushed commit (`git show <sha>:<checklist>`) and of the working tree with
// activeItems of the guard scripts/full-run.mjs and refuses the push with each task in progress; a pushed commit
// without the checklist, a Git error and a parser error also refuse it. `commit` applies the same check to one commit
// and also requires that the commit tracks .githooks/pre-push as an executable file; it prints each line of a refusal
// as a GitHub error annotation and appends the refusal to $GITHUB_STEP_SUMMARY when that variable is set. Every make
// run sets core.hooksPath to .githooks (Makefile), and `make hooks` installs and checks it.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeItems, CHECKLIST } from './full-run.mjs';
import { createProgress } from './kit/test-progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node scripts/push-gate.mjs hook | commit <rev> | hooks-check';
export const HOOKS_PATH = '.githooks';
export const HOOK = '.githooks/pre-push';

const REASON = 'A push happens only when no checklist task is [~] (AGENTS.md): CI runs the full suite on the pushed tree, and its guard refuses a tree with a task in progress.';
const REMEDY = 'Complete each task ([o] with its changelog entry, committed), or mark it [!] with its cause and retry condition when it must be bypassed; then push again.';

function git(root, ...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.error) throw run.error;
  return run;
}

/** The pushed refs of the pre-push input whose local commit exists; a deleted ref pushes no commit. */
export function pushedCommits(input) {
  return input.split('\n').map(line => line.trim().split(/\s+/)).filter(fields => fields.length === 4 && !/^0+$/.test(fields[1]))
    .map(([ref, sha]) => ({ ref, sha }));
}

/** The refusal of the places (`{ where, items }`) whose checklist has a task in progress, or null when none has. */
export function refusal(places) {
  const lines = places.flatMap(({ where, items }) => items.map(item => `  ${where}: ${item.id} ${item.title}`));
  if (lines.length === 0) return null;
  return [`push refused: checklist tasks are in progress (${CHECKLIST})`, ...lines, REASON, REMEDY];
}

// The tasks in progress of the checklist of a commit, or a refusal line naming why the checklist cannot be read.
function committedItems(root, label, sha) {
  const shown = git(root, 'show', `${sha}:${CHECKLIST}`);
  if (shown.status !== 0) return { error: `push refused: ${label} has no ${CHECKLIST}, so its tasks cannot be read (${shown.stderr.trim()})` };
  return { items: activeItems(shown.stdout) };
}

const short = (root, sha) => git(root, 'rev-parse', '--short', sha).stdout.trim() || sha;

/** The lines of a refusal of a push of `input` (the pre-push stdin) from the checkout `root`, or null. */
export function checkPush(root, input) {
  const places = [];
  for (const { ref, sha } of pushedCommits(input)) {
    const where = `${ref} ${short(root, sha)}`;
    const { items, error } = committedItems(root, where, sha);
    if (error) return [error, REASON];
    places.push({ where, items });
  }
  places.push({ where: 'working tree', items: activeItems(readFileSync(path.join(root, CHECKLIST), 'utf8')) });
  return refusal(places);
}

/** The lines of a refusal of the commit `rev`: a task in progress, a missing checklist or a hook it does not track. */
export function checkCommit(root, rev) {
  const parsed = git(root, 'rev-parse', '--verify', `${rev}^{commit}`);
  if (parsed.status !== 0) return [`push refused: ${rev} is not a commit (${parsed.stderr.trim()})`];
  const sha = parsed.stdout.trim();
  const where = short(root, sha);
  const lines = [];
  const { items, error } = committedItems(root, where, sha);
  if (error) lines.push(error);
  else lines.push(...(refusal([{ where, items }]) ?? []));
  const hook = git(root, 'ls-tree', sha, '--', HOOK).stdout.trim();
  if (!hook.startsWith('100755 blob ')) {
    lines.push(`push refused: commit ${where} does not track ${HOOK} as an executable file (mode 100755)${hook ? `; it tracks ${hook.split(/\s/)[0]}` : ''}, so a clone of it has no pre-push hook; add it with git add --chmod=+x ${HOOK}`);
  }
  return lines.length ? lines : null;
}

/** Why the pre-push hook does not run in the checkout `root`, or null when it is installed. */
export function hooksIssue(root) {
  const configured = git(root, 'config', 'core.hooksPath').stdout.trim();
  if (configured !== HOOKS_PATH) return `core.hooksPath is ${configured || 'unset'}, not ${HOOKS_PATH}, so the pre-push hook ${HOOK} does not run; run make hooks`;
  let stat;
  try {
    stat = statSync(path.join(root, HOOK));
  } catch {
    return `${HOOK} does not exist, so no pre-push hook runs; restore it from the commit`;
  }
  if (!stat.isFile() || (stat.mode & 0o111) === 0) return `${HOOK} is not an executable file, so Git does not run it; run git add --chmod=+x ${HOOK} and chmod +x ${HOOK}`;
  return null;
}

// The hook reports to the terminal of the push; a failure of the check itself refuses the push with its cause.
function hook(root) {
  let lines;
  try {
    lines = checkPush(root, readFileSync(0, 'utf8'));
  } catch (error) {
    lines = [`push refused: the push check failed: ${error.message}`, REASON];
  }
  if (!lines) return 0;
  process.stderr.write(`${lines.join('\n')}\n`);
  return 1;
}

// The CI command prints through the shared progress lines, each refusal line as an error annotation.
function commit(root, rev) {
  const progress = createProgress({ write: text => process.stdout.write(text) });
  const id = `push check ${rev}`;
  progress.start(id);
  let lines;
  try {
    lines = checkCommit(root, rev);
  } catch (error) {
    lines = [`push refused: the push check failed: ${error.message}`];
  }
  if (lines) {
    progress.fail(id, undefined, lines.join('\n'));
    for (const line of lines) process.stdout.write(`::error::${line.replaceAll('%', '%25')}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  } else {
    progress.pass(id);
  }
  return progress.close('push check').ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'hook' && args.length === 0) process.exitCode = hook(ROOT);
  else if (mode === 'commit' && args.length === 1) process.exitCode = commit(ROOT, args[0]);
  else if (mode === 'hooks-check' && args.length === 0) {
    const issue = hooksIssue(ROOT);
    if (issue) process.stderr.write(`hooks-check: ${issue}\n`);
    else process.stdout.write(`hooks-check: ${HOOK} runs before every push (core.hooksPath ${HOOKS_PATH})\n`);
    process.exitCode = issue ? 1 : 0;
  } else {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
  }
}
