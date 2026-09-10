import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const git = process.platform === 'win32' ? 'git.exe' : 'git';

function execute(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function executeNpm(args, cwd = root) {
  const result = execute(npm, args, cwd);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    assert.fail([
      `npm ${args.join(' ')} did not return JSON:`,
      result.stdout,
      result.stderr,
    ].join('\n'));
  }
  return { ...result, report };
}

function trackedLockFiles() {
  const result = execute(git, ['ls-files', '--', 'package-lock.json', '**/package-lock.json']);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).sort();
}

test('installed packages form one valid dependency graph', () => {
  const result = executeNpm(['ls', '--all', '--json']);
  assert.equal(result.status, 0, [
    ...(result.report.problems ?? []),
    result.report.error?.summary,
    result.stderr,
  ].filter(Boolean).join('\n'));
});

test('tracked npm lock files have no moderate or higher vulnerability', () => {
  const failures = [];
  for (const lockFile of trackedLockFiles()) {
    const directory = path.dirname(path.join(root, lockFile));
    const result = executeNpm([
      'audit', '--package-lock-only', '--audit-level=moderate', '--json',
    ], directory);
    const counts = result.report.metadata?.vulnerabilities;
    assert.ok(counts, `${lockFile}: npm audit did not return vulnerability counts`);
    if (result.status !== 0 || counts.moderate + counts.high + counts.critical !== 0) {
      failures.push({
        lockFile,
        vulnerabilities: counts,
        packages: Object.keys(result.report.vulnerabilities ?? {}),
      });
    }
  }
  assert.deepEqual(failures, []);
});
