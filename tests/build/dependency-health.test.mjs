import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function execute(args) {
  const result = spawnSync(npm, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
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

test('installed packages form one valid dependency graph', () => {
  const result = execute(['ls', '--all', '--json']);
  assert.equal(result.status, 0, [
    ...(result.report.problems ?? []),
    result.report.error?.summary,
    result.stderr,
  ].filter(Boolean).join('\n'));
});

test('installed packages have no moderate or higher vulnerability', () => {
  const result = execute(['audit', '--audit-level=moderate', '--json']);
  const counts = result.report.metadata?.vulnerabilities;
  assert.ok(counts, 'npm audit did not return vulnerability counts');
  assert.equal(result.status, 0, JSON.stringify({
    vulnerabilities: counts,
    packages: Object.keys(result.report.vulnerabilities ?? {}),
  }, null, 2));
  assert.equal(counts.moderate + counts.high + counts.critical, 0);
});
