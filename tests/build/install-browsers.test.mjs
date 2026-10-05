// The browser installation of CI and the Linux style check (scripts/install-browsers.mjs): the browsers at the builds
// that the locked packages pin, and the set-user-ID sandbox helper of that Chrome, installed by one `install` command
// with the helper source and its path as its two operands.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';

import { installCommands, SANDBOX_HELPER } from '../../scripts/install-browsers.mjs';

test('the browsers are installed at the builds that the locked packages pin', () => {
  const [chrome, firefox, webkit] = installCommands(['chrome', 'firefox', 'webkit'], { withDeps: true });
  assert.deepEqual(chrome.args, ['--no-install', 'puppeteer', 'browsers', 'install', `chrome@${PUPPETEER_REVISIONS.chrome}`, '--format', '{{path}}']);
  assert.deepEqual(firefox.args, ['--no-install', 'puppeteer', 'browsers', 'install', `firefox@${PUPPETEER_REVISIONS.firefox}`, '--format', '{{path}}']);
  assert.deepEqual(webkit.args, ['--no-install', 'playwright', 'install', '--with-deps', 'webkit']);
});

test('the sandbox helper is installed by one install command, with sudo unless the run is root', () => {
  const user = installCommands(['chrome'], { chromeSandbox: true, root: false }).at(-1);
  assert.deepEqual([user.command, ...user.args], ['sudo', 'install', '-o', 'root', '-g', 'root', '-m', '4755']);
  const root = installCommands(['chrome'], { chromeSandbox: true, root: true }).at(-1);
  assert.deepEqual([root.command, ...root.args], ['install', '-o', 'root', '-g', 'root', '-m', '4755']);
});

test('the helper command with its two operands writes the helper file', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-install-browsers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // A sudo stand-in records its arguments and runs install without the owner options, which need root.
  const log = path.join(directory, 'sudo.log');
  writeFileSync(path.join(directory, 'sudo'), `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\n[ "$1" = install ] || exit 9\nshift\nexec install -m 4755 "$7" "$8"\n`);
  chmodSync(path.join(directory, 'sudo'), 0o755);
  const source = path.join(directory, 'chrome_sandbox');
  writeFileSync(source, 'helper\n');
  const helper = path.join(directory, 'chrome-devel-sandbox');
  const command = installCommands(['chrome'], { chromeSandbox: true, root: false }).at(-1);
  // macOS may spend a long time on the first execution of a newly written executable (C7.13); the case logs it.
  const started = performance.now();
  const run = spawnSync(path.join(directory, command.command), [...command.args, source, helper], { encoding: 'utf8' });
  process.stderr.write(`[stub] the first execution of ${path.join(directory, command.command)} ended in ${Math.round(performance.now() - started)} ms\n`);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), [...command.args, source, helper]);
  assert.equal(existsSync(helper), true);
  assert.equal(statSync(helper).mode & 0o7777, 0o4755);
  assert.equal(SANDBOX_HELPER, '/usr/local/sbin/chrome-devel-sandbox');
});
