// The report of make ci-targets (scripts/ci-targets.mjs, scripts/target-report.mjs): every target runs to its end, also
// after an earlier one failed, and the report holds the log of each target and a summary with the first failure lines
// of each failed one, which also goes to the job summary of GitHub Actions.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { failureLines, FAILURE_LINES } from '../../scripts/target-report.mjs';
import { ROOT } from '../../scripts/tracked-files.mjs';

test('make ci-targets runs every target to its end and reports the failed one with its first failure lines', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-ci-targets-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // A checkout with the two scripts and a Makefile of a failing and a passing probe target.
  for (const file of ['scripts/ci-targets.mjs', 'scripts/target-report.mjs', 'scripts/holder-lock.mjs', 'scripts/test-progress/progress.mjs']) {
    const target = path.join(directory, file);
    spawnSync('mkdir', ['-p', path.dirname(target)]);
    writeFileSync(target, readFileSync(path.join(ROOT, file)));
  }
  writeFileSync(path.join(directory, 'Makefile'), 'probe-fail:\n\t@echo starting\n\t@echo "✖ probe case: expected 1, got 2"; exit 3\nprobe-pass:\n\t@echo all good\n');
  const summary = path.join(directory, 'step-summary.md');
  const run = spawnSync(process.execPath, ['scripts/ci-targets.mjs', 'var/report/ci-targets', 'probe-fail', 'probe-pass'], {
    cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
  });
  assert.equal(run.status, 1, run.stderr);
  const report = path.join(directory, 'var/report/ci-targets');
  assert.match(readFileSync(path.join(report, 'targets/probe-fail.log'), 'utf8'), /✖ probe case: expected 1, got 2\n[\s\S]*\[report\] make -k probe-fail ended with status 2\n$/);
  assert.match(readFileSync(path.join(report, 'targets/probe-pass.log'), 'utf8'), /all good\n[\s\S]*ended with status 0\n$/);
  const text = readFileSync(path.join(report, 'summary.md'), 'utf8');
  assert.match(text, /1 of 2 targets passed\./);
  assert.match(text, /\| probe-fail \| failed \| \d+\.\d s \|\n\| probe-pass \| passed \| \d+\.\d s \|/);
  assert.match(text, /## probe-fail: failed\n\nLog: targets\/probe-fail\.log\n\n```\n✖ probe case: expected 1, got 2\n/);
  assert.equal(readFileSync(summary, 'utf8'), text);
  assert.equal(existsSync(path.join(directory, 'var/report/ci-targets.lock')), false, 'the run releases its lock');
});

test('the failure lines are the lines that report a failure, or the last lines of a log without one', () => {
  assert.deepEqual(failureLines('a\n✖ b\nc\nmake: *** [x] Error 1\n'), ['✖ b', 'make: *** [x] Error 1']);
  const quiet = Array.from({ length: FAILURE_LINES + 5 }, (_, index) => `line ${index}`).join('\n');
  assert.deepEqual(failureLines(quiet), Array.from({ length: FAILURE_LINES }, (_, index) => `line ${index + 5}`));
});
