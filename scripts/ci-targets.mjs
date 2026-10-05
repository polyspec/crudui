#!/usr/bin/env node
// Runs make targets past failures and writes their report (docs/operations/testing.md, "Reports"):
//
//   node scripts/ci-targets.mjs <report directory> <target>...
//
// Each target runs as `make -k <target>` to its end, also after an earlier target failed, with its output printed and
// written to <report directory>/targets/<target>.log; summary.md names each failed target with its first failure lines
// (scripts/target-report.mjs). The run holds the lock <report directory>.lock, so two runs never write one report. It
// ends with status 1 when a target failed. `make ci-targets TARGETS="..."` starts it in every CI job.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireHolderLock } from './holder-lock.mjs';
import { runLogged, startReport, writeSummary } from './target-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = text => process.stdout.write(`[ci-targets] ${text}\n`);
const [directory, ...targets] = process.argv.slice(2);
if (!directory || targets.length === 0) {
  process.stderr.write('usage: node scripts/ci-targets.mjs <report directory> <target>...\n');
  process.exit(2);
}
const report = path.resolve(directory);
mkdirSync(path.dirname(report), { recursive: true });
const lock = acquireHolderLock(`${report}.lock`);
try {
  startReport(report);
  const results = [];
  for (const [index, name] of targets.entries()) {
    say(`start ${name} (${index + 1}/${targets.length})`);
    const begin = Date.now();
    let passed;
    try {
      passed = await runLogged(root, name, report);
    } catch (error) {
      process.stderr.write(`[ci-targets] make -k ${name} did not start: ${error.message}\n`);
      passed = false;
    }
    results.push({ name, status: passed ? 'passed' : 'failed', elapsedMs: Date.now() - begin });
    say(`${name} ${passed ? 'passed' : 'failed'} in ${((Date.now() - begin) / 1000).toFixed(1)} s`);
  }
  process.stdout.write(writeSummary(report, `make ci-targets ${targets.join(' ')}`, results));
  process.exitCode = results.every(result => result.status === 'passed') ? 0 : 1;
} finally {
  lock.release();
}
