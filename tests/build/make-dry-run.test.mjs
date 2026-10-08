// Every test that runs a dry run of make goes through tests/build/make-dry-run.mjs, whose output does not depend on
// the version of GNU Make or on a parent make.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isVendored } from '../../scripts/repository-files.mjs';
import { makeDryRun, makeEnvironment } from './make-dry-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('no test file runs a dry run of make outside the helper', () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.mjs', '*.js', '*.ts'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.split('\n').filter(file => file && file !== 'tests/build/make-dry-run.mjs' && !isVendored(file));
  const violations = [];
  for (const file of files) {
    let source;
    try { source = readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
    source.split('\n').forEach((line, index) => {
      // A spawn of make with -n among its arguments, in any of the spawn forms of the tests.
      if (/['"]make['"]/.test(line) && /['"]-n['"]|['"]--dry-run['"]|['"]--just-print['"]/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, [], 'run dry runs of make through makeDryRun of tests/build/make-dry-run.mjs');
});

test('the environment sets MAKEFLAGS=w and removes the variables of a parent make', () => {
  const env = makeEnvironment({ PATH: '/bin', MAKEFLAGS: 'k', MAKELEVEL: '1', GNUMAKEFLAGS: '--no-silent', MAKEFILES: 'other.mk', MFLAGS: '-k' });
  assert.deepEqual(env, { PATH: '/bin', MAKEFLAGS: 'w' });
});

test('a dry run under a parent make prints only the commands of the target', () => {
  const run = makeDryRun(ROOT, 'rerun-failed', { env: { ...process.env, MAKELEVEL: '1', MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, run.stdout);
  assert.match(lines[0], /node scripts\/kit\/full-run\.mjs rerun-failed$/);
});
