#!/usr/bin/env node
/*
 * Holder locks of resources that only one run may use at a time (docs/operations/testing.md,
 * "Shared resources").
 *
 * A lock is one file. Its record names the holder: the checkout of the code that took it, the
 * holder's pid, the start time of that process, the time the lock was taken, the command and a
 * random token. The record is written completely to a private file and linked to the lock path;
 * the link fails when the lock exists, so taking a lock is atomic and a reader never sees a
 * partial record. A run that finds the lock held is refused with the holder's record. A lock whose
 * holder process no longer runs is reported and stays in place; `remove-dead` removes it
 * explicitly. Only the holder releases its lock: the release checks the token first.
 *
 *   node scripts/holder-lock.mjs hold <lock file> -- <command> [arguments...]
 *   node scripts/holder-lock.mjs remove-dead <lock file>
 *   node scripts/holder-lock.mjs user-lock-file <name>
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
export const repositoryRoot = path.resolve(path.dirname(script), '..');

/** The lock file of a resource of this checkout. */
export function checkoutLockFile(name) {
  return path.join(repositoryRoot, 'var/locks', `${name}.lock`);
}

/** The lock file of a resource of the user account, which every checkout shares. */
export function userLockFile(name) {
  return path.join(os.homedir(), '.local/state/crudui/locks', `${name}.lock`);
}

/**
 * The start time of a process from the text of `/proc/<pid>/stat` and the boot time of `/proc/stat`:
 * field 22 counts clock ticks from boot. The command name in parentheses may hold spaces, so the
 * fields are counted after its closing parenthesis.
 */
export function procStart(stat, systemStat) {
  const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const boot = /^btime (\d+)$/m.exec(systemStat)?.[1];
  assert.match(ticks ?? '', /^\d+$/, `No start time in ${JSON.stringify(stat)}`);
  assert.ok(boot, 'No boot time in /proc/stat');
  return `${ticks} clock ticks after the boot at ${new Date(Number(boot) * 1000).toISOString()}`;
}

/**
 * The start time of a running process, or null when no such process runs: from `/proc` on Linux,
 * whose minimal container images have no `ps`, and as `ps` prints it elsewhere.
 */
export function processStart(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return null;
    if (error.code !== 'EPERM') throw error;
  }
  if (process.platform === 'linux') {
    let stat;
    try {
      stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    return procStart(stat, fs.readFileSync('/proc/stat', 'utf8'));
  }
  try {
    return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
}

/** Whether the process that wrote the record still runs; a reused pid has another start time. */
export function holderRunning(record) {
  return processStart(record.pid) === record.processStart;
}

export function describeHolder(record) {
  return `pid ${record.pid} (process started ${record.processStart}) of checkout ${record.checkout}, `
    + `held since ${record.acquired} for ${JSON.stringify(record.command)}`;
}

export class HolderLockRefused extends Error {
  constructor(message, record) {
    super(message);
    this.name = 'HolderLockRefused';
    this.record = record;
  }
}

/** Read and check a lock record; a record that cannot be read is an error, never a free lock. */
export function readLockRecord(lockFile) {
  const text = fs.readFileSync(lockFile, 'utf8');
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    throw new Error(`Lock file ${lockFile} holds no lock record: ${JSON.stringify(text)}`);
  }
  for (const [field, type] of [['checkout', 'string'], ['pid', 'number'], ['processStart', 'string'],
    ['acquired', 'string'], ['command', 'string'], ['token', 'string']]) {
    assert.equal(typeof record?.[field], type, `Lock file ${lockFile} has no ${field}: ${text}`);
  }
  return record;
}

function refusal(lockFile, record) {
  if (holderRunning(record)) {
    return new HolderLockRefused(`${lockFile} is held by ${describeHolder(record)}; `
      + 'the holder releases it when its run ends', record);
  }
  return new HolderLockRefused(`${lockFile} is held by ${describeHolder(record)}, which is not `
    + `running; remove the lock with: node ${script} remove-dead ${lockFile}`, record);
}

/**
 * Take the lock or throw HolderLockRefused with the holder's record. Returns the handle whose
 * `release()` removes the lock.
 */
export function acquireHolderLock(lockFile, { command = process.argv.slice(1).join(' ') } = {}) {
  assert.ok(path.isAbsolute(lockFile), `Lock file must be absolute: ${lockFile}`);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const start = processStart(process.pid);
  assert.ok(start, `The start time of process ${process.pid} is unknown`);
  const record = {
    checkout: repositoryRoot, pid: process.pid, processStart: start,
    acquired: new Date().toISOString(), command, token: randomBytes(16).toString('hex'),
  };
  const written = `${lockFile}.${process.pid}.${record.token}`;
  fs.writeFileSync(written, `${JSON.stringify(record)}\n`, { flag: 'wx' });
  try {
    fs.linkSync(written, lockFile);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw refusal(lockFile, readLockRecord(lockFile));
  } finally {
    fs.unlinkSync(written);
  }
  return {
    lockFile,
    record,
    release() {
      const current = readLockRecord(lockFile);
      assert.equal(current.token, record.token,
        `${lockFile} was replaced while this run held it; it now names ${describeHolder(current)}`);
      fs.unlinkSync(lockFile);
    },
  };
}

/**
 * Remove a lock whose holder no longer runs, and return its record. A running holder is refused.
 * The lock is renamed aside before its record is checked again, so a lock that a new holder took
 * in the meantime is put back instead of removed.
 */
export function removeDeadLock(lockFile) {
  assert.ok(path.isAbsolute(lockFile), `Lock file must be absolute: ${lockFile}`);
  const record = readLockRecord(lockFile);
  if (holderRunning(record)) throw refusal(lockFile, record);
  const aside = `${lockFile}.removing.${process.pid}.${randomBytes(8).toString('hex')}`;
  fs.renameSync(lockFile, aside);
  const moved = readLockRecord(aside);
  if (moved.token !== record.token) {
    try {
      fs.linkSync(aside, lockFile);
    } catch (error) {
      throw new Error(`${lockFile} was taken by ${describeHolder(moved)} during the removal and a `
        + `third run took it before it was restored; the record of the second holder is in ${aside}`,
      { cause: error });
    }
    fs.unlinkSync(aside);
    throw refusal(lockFile, moved);
  }
  fs.unlinkSync(aside);
  return record;
}

/**
 * Take the lock for the rest of this process: it is released when the process exits, also through
 * `process.exit` from a signal handler. A process that a signal ends without a handler leaves the
 * lock to `remove-dead`.
 */
export function holdUntilExit(lockFile) {
  const lock = acquireReported(lockFile);
  process.once('exit', () => lock.release());
  return lock;
}

/**
 * Run a command with inherited standard streams and return its exit status. SIGINT, SIGTERM and
 * SIGHUP of this process go to the command, so a lock holder releases its lock after the command
 * has ended.
 */
export async function runCommand(command, args, { cwd, env } = {}) {
  const child = spawn(command, args, { stdio: 'inherit', cwd, env });
  const forward = signal => child.kill(signal);
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, forward);
  try {
    return await new Promise(resolve => {
      child.on('error', error => {
        process.stderr.write(`lock: ${command} did not start: ${error.message}\n`);
        resolve(127);
      });
      child.on('exit', (code, signal) => resolve(code ?? 128 + os.constants.signals[signal]));
    });
  } finally {
    for (const signal of signals) process.off(signal, forward);
  }
}

/** Take the lock and print the acquisition; the handle's release prints the release. */
export function acquireReported(lockFile, options) {
  const lock = acquireHolderLock(lockFile, options);
  process.stderr.write(`lock: acquired ${lockFile} (pid ${process.pid})\n`);
  return {
    ...lock,
    release() {
      lock.release();
      process.stderr.write(`lock: released ${lockFile}\n`);
    },
  };
}

/** Run a command while holding the lock; the exit status is the command's. */
export async function holdWhileRunning(lockFile, command, args, { cwd } = {}) {
  const lock = acquireReported(lockFile, { command: [command, ...args].join(' ') });
  try {
    return await runCommand(command, args, { cwd });
  } finally {
    lock.release();
  }
}

async function main(argv) {
  const [operation, lockFile, separator, command, ...args] = argv;
  if (operation === 'hold' && lockFile && separator === '--' && command) {
    process.exitCode = await holdWhileRunning(lockFile, command, args);
  } else if (operation === 'remove-dead' && lockFile && argv.length === 2) {
    const record = removeDeadLock(lockFile);
    process.stdout.write(`lock: removed ${lockFile} of ${describeHolder(record)}, which is not running\n`);
  } else if (operation === 'user-lock-file' && /^[A-Za-z0-9._-]+$/.test(lockFile ?? '') && argv.length === 2) {
    process.stdout.write(`${userLockFile(lockFile)}\n`);
  } else {
    throw new Error('Usage: node scripts/holder-lock.mjs hold <lock file> -- <command> [arguments...]\n'
      + '       node scripts/holder-lock.mjs remove-dead <lock file>\n'
      + '       node scripts/holder-lock.mjs user-lock-file <name>');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`lock: ${error.message}\n`);
    process.exitCode = 1;
  });
}
