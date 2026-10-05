import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  acquireHolderLock, processStart, readLockRecord, removeDeadLock, repositoryRoot,
} from '../../scripts/holder-lock.mjs';

const script = fileURLToPath(new URL('../../scripts/holder-lock.mjs', import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-holder-lock-'));
after(() => fs.rmSync(directory, { recursive: true, force: true }));
let count = 0;
const lockFile = () => path.join(directory, `resource-${++count}.lock`);

/** Start `hold` with a command that runs until its standard input closes. */
async function holder(file) {
  const child = spawn(process.execPath, [script, 'hold', file, '--', process.execPath, '-e',
    'process.stdin.resume(); process.stdin.on("end", () => process.exit(0))'],
  { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.setEncoding('utf8');
  const acquired = new Promise((resolve, reject) => {
    child.stderr.on('data', text => {
      errors += text;
      if (errors.includes('lock: acquired')) resolve();
    });
    child.on('exit', code => reject(new Error(`hold exited with ${code}: ${errors}`)));
  });
  await acquired;
  return { child, errors: () => errors };
}

/** A pid that no longer runs: the pid of a child that has exited. */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', '']);
  await once(child, 'exit');
  assert.equal(processStart(child.pid), null);
  return child.pid;
}

test('a lock record names the checkout, the pid and the process start time', () => {
  const file = lockFile();
  const lock = acquireHolderLock(file, { command: 'record case' });
  const record = readLockRecord(file);
  assert.equal(record.checkout, repositoryRoot);
  assert.equal(record.pid, process.pid);
  assert.equal(record.processStart, processStart(process.pid));
  assert.equal(record.command, 'record case');
  assert.ok(!Number.isNaN(Date.parse(record.acquired)));
  lock.release();
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.startsWith(path.basename(file))), []);
});

test('a second run is refused with the holder of another process', async () => {
  const file = lockFile();
  const { child, errors } = await holder(file);
  assert.throws(() => acquireHolderLock(file), error => {
    assert.equal(error.name, 'HolderLockRefused');
    assert.match(error.message, new RegExp(`pid ${child.pid} \\(process started ${processStart(child.pid)}\\)`));
    assert.match(error.message, new RegExp(`of checkout ${repositoryRoot}`));
    assert.match(error.message, /the holder releases it/);
    return true;
  });
  const refused = spawn(process.execPath, [script, 'hold', file, '--', process.execPath, '-e', '']);
  let message = '';
  refused.stderr.setEncoding('utf8').on('data', text => { message += text; });
  const [code] = await once(refused, 'exit');
  assert.equal(code, 1);
  assert.match(message, new RegExp(`is held by pid ${child.pid} `));
  child.stdin.end();
  const [status] = await once(child, 'exit');
  assert.equal(status, 0, errors());
  assert.match(errors(), /lock: released/);
  assert.equal(fs.existsSync(file), false);
});

test('only one of several concurrent runs takes the lock', async () => {
  const file = lockFile();
  const program = `import { acquireHolderLock } from ${JSON.stringify(script)};
    try { acquireHolderLock(${JSON.stringify(file)}); process.stdout.write('held');
      process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); }
    catch (error) { process.stdout.write(error.name); }`;
  const runs = Array.from({ length: 8 }, () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program]);
    let output = '';
    child.stdout.setEncoding('utf8');
    const result = new Promise(resolve => child.stdout.on('data', text => {
      output += text;
      resolve(output);
    }));
    return { child, result };
  });
  const results = await Promise.all(runs.map(run => run.result));
  assert.equal(results.filter(result => result === 'held').length, 1, results.join(', '));
  assert.equal(results.filter(result => result === 'HolderLockRefused').length, 7, results.join(', '));
  for (const run of runs) run.child.stdin.end();
  await Promise.all(runs.map(run => run.child.exitCode === null ? once(run.child, 'exit') : null));
});

test('a lock of a holder that no longer runs is reported and kept until removed explicitly', async () => {
  const file = lockFile();
  const pid = await deadPid();
  const record = {
    checkout: '/elsewhere/crudui', pid, processStart: 'Mon Oct  5 10:00:00 2026',
    acquired: '2026-10-05T01:00:00.000Z', command: 'make deploy', token: 'dead',
  };
  fs.writeFileSync(file, `${JSON.stringify(record)}\n`);
  assert.throws(() => acquireHolderLock(file), error => {
    assert.match(error.message, new RegExp(`pid ${pid} \\(process started Mon Oct  5 10:00:00 2026\\) `
      + 'of checkout /elsewhere/crudui'));
    assert.match(error.message, /which is not running; remove the lock with: node .*holder-lock\.mjs remove-dead /);
    return true;
  });
  assert.deepEqual(readLockRecord(file), record);

  const removal = spawn(process.execPath, [script, 'remove-dead', file]);
  let output = '';
  removal.stdout.setEncoding('utf8').on('data', text => { output += text; });
  const [code] = await once(removal, 'exit');
  assert.equal(code, 0);
  assert.match(output, new RegExp(`removed ${file} of pid ${pid} `));
  assert.equal(fs.existsSync(file), false);
});

test('a reused pid with another start time counts as a holder that no longer runs', () => {
  const file = lockFile();
  fs.writeFileSync(file, `${JSON.stringify({
    checkout: repositoryRoot, pid: process.pid, processStart: 'Thu Jan  1 00:00:00 1970',
    acquired: '1970-01-01T00:00:00.000Z', command: 'earlier run', token: 'reused',
  })}\n`);
  assert.throws(() => acquireHolderLock(file), /which is not running/);
  assert.equal(removeDeadLock(file).token, 'reused');
});

test('removing the lock of a running holder is refused', async () => {
  const file = lockFile();
  const { child } = await holder(file);
  assert.throws(() => removeDeadLock(file), new RegExp(`is held by pid ${child.pid} `));
  assert.equal(readLockRecord(file).pid, child.pid);
  child.stdin.end();
  await once(child, 'exit');
});

test('only the holder releases its lock', () => {
  const file = lockFile();
  const lock = acquireHolderLock(file);
  const replaced = { ...readLockRecord(file), token: 'another' };
  fs.writeFileSync(file, `${JSON.stringify(replaced)}\n`);
  assert.throws(() => lock.release(), /was replaced while this run held it/);
  assert.equal(readLockRecord(file).token, 'another');
  fs.unlinkSync(file);
});

test('a lock file without a record is an error, not a free lock', () => {
  const file = lockFile();
  fs.writeFileSync(file, '');
  assert.throws(() => acquireHolderLock(file), /holds no lock record/);
  assert.equal(fs.readFileSync(file, 'utf8'), '');
});
