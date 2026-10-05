#!/usr/bin/env node
// The guard of the full suite. `make ci` and `make rerun-failed` start it before any step:
//
//   node scripts/full-run.mjs run <command>...  run every command of the full suite (CI_COMMANDS of the Makefile)
//   node scripts/full-run.mjs rerun-failed      rerun the commands of the current tree that did not pass
//
// A target of the full suite is one command of the CI workflow, which runs with `sh -c` and is named by its text.
// The full suite runs once, when every active checklist item is done (AGENTS). The guard refuses a run while a task
// row of docs/plans/execution-checklist.md is `[~]`, while the pre-push hook is not installed
// (`scripts/push-gate.mjs hooks-check`), while tracked changes are uncommitted, and while the run of another process
// is still going on. A full run is refused when var/full-run.json already records a run of the current tree
// (`git rev-parse HEAD^{tree}`); `rerun-failed` is refused unless that record exists and has targets that did not
// pass. The guard prints its decision with the reason, runs each target with `sh -c <command>` to its end, prints its
// start and its result with the elapsed time, and writes the record before and after each target, so a run that is
// stopped stays recorded as `incomplete`. No step has a time limit.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toolchainVersions } from './check-toolchain.mjs';
import { acquireHolderLock, HolderLockRefused } from './holder-lock.mjs';
import { hooksIssue } from './push-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node scripts/full-run.mjs run <command>... | rerun-failed';
export const CHECKLIST = 'docs/plans/execution-checklist.md';
// The record of the last full run of this checkout; /var/ is ignored by Git.
export const RECORD = 'var/full-run.json';

const TASK_ROW = /^\|\s*(C\d[\w.-]*)\s*\|/;

/** The task rows of a checklist in state `[~]`, with the text of their task cell as title. */
export function activeItems(text) {
  const items = [];
  for (const line of text.split('\n')) {
    const row = TASK_ROW.exec(line);
    if (!row) continue;
    // A cell may contain an escaped `\|`.
    const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim());
    if (cells[cells.length - 1] === '[~]') items.push({ id: row[1], title: cells[1] });
  }
  return items;
}

const notPassed = record => record.targets.filter(target => target.status !== 'passed').map(target => target.name);

/**
 * Decides whether the guard runs. `mode` is `run` or `rerun-failed`; `active` the active checklist items; `hooks` why
 * the pre-push hook does not run, or null; `dirty` the `git status --porcelain` lines of tracked files; `tree` the
 * current tree; `record` the record of the last run or null; `running` whether the process of an incomplete record
 * still exists. Returns `{ run, reason, targets }`.
 */
export function decide({ mode, targets, active, hooks = null, dirty, tree, record, running }) {
  const refuse = reason => ({ run: false, reason, targets: [] });
  if (active.length > 0) {
    return refuse(`${active.length} active checklist item${active.length === 1 ? '' : 's'} in ${CHECKLIST}; the full suite runs once, when every active item is done:\n${active.map(item => `  ${item.id} ${item.title}`).join('\n')}`);
  }
  if (hooks) {
    return refuse(`the pre-push hook is not installed, so a push with a task in progress is not refused: ${hooks}`);
  }
  if (dirty.length > 0) {
    return refuse(`the working tree has uncommitted tracked changes; a full run verifies a committed tree:\n${dirty.map(line => `  ${line}`).join('\n')}`);
  }
  if (record && running) {
    return refuse(`the run started ${record.started} by process ${record.pid} is still running on tree ${record.tree}`);
  }
  if (mode === 'run') {
    if (record && record.tree === tree) {
      const open = notPassed(record);
      const rerun = open.length > 0 ? `; make rerun-failed reruns its targets that did not pass: ${open.join(', ')}` : '';
      return refuse(`the full run of tree ${tree} (commit ${record.commit}) started ${record.started} with result ${record.result}; the full suite runs once per tree${rerun}`);
    }
    const before = record
      ? `tree ${tree} differs from the tree ${record.tree} of the last full run (result ${record.result}, started ${record.started})`
      : `no full-run record in ${RECORD} for tree ${tree}`;
    return { run: true, reason: `${before}; no active checklist item; ${targets.length} targets`, targets };
  }
  if (!record) return refuse(`no full-run record in ${RECORD}; rerun-failed reruns the targets of a full run of the current tree that did not pass`);
  if (record.tree !== tree) return refuse(`the last full run (started ${record.started}) verified tree ${record.tree}, not the current tree ${tree}; rerun-failed reruns only targets of the current tree`);
  const open = notPassed(record);
  if (open.length === 0) return refuse(`the full run of tree ${tree} started ${record.started} passed; no target failed`);
  return { run: true, reason: `the full run of tree ${tree} started ${record.started} has ${open.length} target${open.length === 1 ? '' : 's'} that did not pass: ${open.join(', ')}`, targets: open };
}

function git(root, ...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}: ${run.stderr.trim()}`);
  return run.stdout;
}

function readRecord(root) {
  const file = path.join(root, RECORD);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

function writeRecord(root, record) {
  const file = path.join(root, RECORD);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.${process.pid}`, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(`${file}.${process.pid}`, file);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    // EPERM: the process exists and belongs to another user.
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)} s`;

// Runs a command of the full suite with `sh -c` in the checkout with its output; resolves whether it ended with status 0.
function runCommand(root, command) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', status => resolve(status === 0));
  });
}

/**
 * Inspects the checkout, decides and runs. `runTarget(name)` resolves whether a target passed. Returns the exit
 * status: 0 when the full result of the tree is passed, 1 otherwise.
 */
export async function fullRun(options) {
  const root = options.root ?? ROOT;
  const print = options.print ?? (line => process.stdout.write(`${line}\n`));
  // The guard reads the record, decides and writes it under the checkout lock `full-run`, so two runs of one checkout
  // never both decide from the same record; a second run is refused with the holder.
  let lock;
  try {
    lock = acquireHolderLock(path.join(root, 'var/locks/full-run.lock'), { command: `full-run ${options.mode}` });
  } catch (error) {
    if (!(error instanceof HolderLockRefused)) throw error;
    print(`[full-run] refuse: ${error.message}`);
    return 1;
  }
  try {
    return await guardedRun({ ...options, root, print });
  } finally {
    lock.release();
  }
}

async function guardedRun({ root, mode, targets = [], runTarget = name => runCommand(root, name), print, evidence = process.env.CRUDUI_CONFORMANCE_EVIDENCE, versions = () => toolchainVersions(undefined, { root }) }) {
  const active = activeItems(readFileSync(path.join(root, CHECKLIST), 'utf8'));
  const hooks = hooksIssue(root);
  const dirty = git(root, 'status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean);
  const tree = git(root, 'rev-parse', 'HEAD^{tree}').trim();
  const commit = git(root, 'rev-parse', 'HEAD').trim();
  const record = readRecord(root);
  const running = Boolean(record && record.result === 'incomplete' && record.pid !== process.pid && alive(record.pid));
  const decision = decide({ mode, targets, active, hooks, dirty, tree, record, running });
  print(`[full-run] ${decision.run ? 'run' : 'refuse'}: ${decision.reason}`);
  if (!decision.run) return 1;
  // `node scripts/check-conformance.mjs`, the last command, checks the evidence that the commands of this tree collect:
  // a full run starts without evidence, and a rerun keeps the evidence of the commands that passed.
  if (!evidence) throw new Error('CRUDUI_CONFORMANCE_EVIDENCE names the conformance evidence directory');
  if (mode === 'run') rmSync(evidence, { recursive: true, force: true });

  const now = () => new Date().toISOString();
  const current = mode === 'run'
    ? { tree, commit, result: 'incomplete', pid: process.pid, started: now(), ended: null, targets: targets.map(name => ({ name, status: 'pending' })), reruns: [] }
    : { ...record, result: 'incomplete', pid: process.pid };
  // The releases that the run runs on: config/toolchain.json pins PHP by its minor, so the patch is evidence of the run.
  const toolchain = versions();
  if (mode === 'run') current.toolchain = toolchain;
  const rerun = mode === 'run' ? null : { started: now(), ended: null, targets: decision.targets, result: 'incomplete', toolchain };
  if (rerun) current.reruns.push(rerun);
  writeRecord(root, current);

  const begin = Date.now();
  for (const [index, name] of decision.targets.entries()) {
    const target = current.targets.find(entry => entry.name === name);
    Object.assign(target, { status: 'running', started: now(), ended: null, elapsedMs: null });
    writeRecord(root, current);
    print(`[full-run] start ${name} (${index + 1}/${decision.targets.length})`);
    const targetBegin = Date.now();
    const passed = await runTarget(name);
    Object.assign(target, { status: passed ? 'passed' : 'failed', ended: now(), elapsedMs: Date.now() - targetBegin });
    writeRecord(root, current);
    print(`[full-run] ${name} ${target.status} in ${seconds(target.elapsedMs)}`);
  }

  const failed = current.targets.filter(target => target.status === 'failed').map(target => target.name);
  current.result = failed.length === 0 ? 'passed' : 'failed';
  current.failed = failed;
  current.ended = now();
  if (rerun) Object.assign(rerun, { ended: current.ended, result: decision.targets.every(name => !failed.includes(name)) ? 'passed' : 'failed' });
  writeRecord(root, current);
  const summary = `${decision.targets.length - decision.targets.filter(name => failed.includes(name)).length} of ${decision.targets.length} targets passed in ${seconds(Date.now() - begin)}`;
  print(failed.length === 0
    ? `[full-run] result passed for tree ${tree}: ${summary}`
    : `[full-run] result failed for tree ${tree}: ${summary}; failed: ${failed.join(', ')}; make rerun-failed reruns them`);
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...targets] = process.argv.slice(2);
  if (!((mode === 'run' && targets.length > 0) || (mode === 'rerun-failed' && targets.length === 0))) {
    console.error(USAGE);
    process.exit(2);
  }
  process.exitCode = await fullRun({ mode, targets });
}
