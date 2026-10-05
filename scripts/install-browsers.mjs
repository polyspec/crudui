#!/usr/bin/env node
// Install the browsers of the browser checks at the builds that the locked packages pin
// (docs/spec/package-build.md, "Runtime and dependency versions"): Chrome and Firefox at the builds of
// PUPPETEER_REVISIONS of the locked puppeteer, into the cache of Puppeteer (PUPPETEER_CACHE_DIR when it is set), and
// WebKit at the build of the locked playwright. No browser of the machine and no stable channel is used, so a run
// tests the same browser builds on every date and machine. An installed build is kept by both tools.
//
//   node scripts/install-browsers.mjs <chrome|firefox|webkit>... [--with-deps] [--chrome-sandbox]
//
// --with-deps installs the system libraries of WebKit (Linux, as root or with sudo). --chrome-sandbox installs the
// set-user-ID sandbox helper of that Chrome as root at /usr/local/sbin/chrome-devel-sandbox, which CHROME_DEVEL_SANDBOX
// names, for a Linux machine whose user namespaces Chrome cannot use.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';

import { useCheckoutNpm } from './checkout-npm.mjs';
import { failureOf, formatSeconds, runCommand } from './run-command.mjs';
import { createProgress } from './test-progress/progress.mjs';

export const SANDBOX_HELPER = '/usr/local/sbin/chrome-devel-sandbox';
const BROWSERS = ['chrome', 'firefox', 'webkit'];

/** The commands that install `browsers`, in order. */
export function installCommands(browsers, { withDeps = false, chromeSandbox = false, root = process.getuid?.() === 0 } = {}) {
  const unknown = browsers.filter(browser => !BROWSERS.includes(browser));
  if (unknown.length || browsers.length === 0) throw new Error(`Usage: node scripts/install-browsers.mjs <${BROWSERS.join('|')}>... [--with-deps] [--chrome-sandbox]; unknown: ${unknown.join(', ') || 'none named'}`);
  const commands = [];
  for (const browser of ['chrome', 'firefox'].filter(name => browsers.includes(name))) {
    commands.push({ id: `${browser} ${PUPPETEER_REVISIONS[browser]}`, command: 'npx', args: ['--no-install', 'puppeteer', 'browsers', 'install', `${browser}@${PUPPETEER_REVISIONS[browser]}`, '--format', '{{path}}'] });
  }
  if (browsers.includes('webkit')) commands.push({ id: 'webkit of playwright', command: 'npx', args: ['--no-install', 'playwright', 'install', ...(withDeps ? ['--with-deps'] : []), 'webkit'] });
  if (chromeSandbox) {
    if (!browsers.includes('chrome')) throw new Error('--chrome-sandbox installs the helper of the Chrome that this run installs; name chrome');
    const install = ['install', '-o', 'root', '-g', 'root', '-m', '4755'];
    commands.push({ id: `Chrome sandbox helper at ${SANDBOX_HELPER}`, sandbox: true, command: root ? 'install' : 'sudo', args: root ? install : ['install', ...install] });
  }
  return commands;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  useCheckoutNpm();
  const args = process.argv.slice(2);
  const lines = createProgress({ write: text => process.stdout.write(text) });
  let chromePath;
  let failed = false;
  try {
    for (const step of installCommands(args.filter(arg => !arg.startsWith('--')), { withDeps: args.includes('--with-deps'), chromeSandbox: args.includes('--chrome-sandbox') })) {
      lines.start(step.id, { group: true });
      // The helper sits beside the chrome executable that the install step printed.
      const stepArgs = step.sandbox ? [...step.args, path.join(path.dirname(chromePath), 'chrome_sandbox'), SANDBOX_HELPER] : step.args;
      const result = await runCommand({ command: step.command, args: stepArgs, stdout: 'pipe' });
      const failure = failureOf(result);
      if (failure) {
        lines.fail(step.id, result.elapsedMs, `${step.command} ${stepArgs.join(' ')} ${failure}\n${result.stdout}`);
        failed = true;
        if (step.id.startsWith('chrome ')) break;
        continue;
      }
      if (step.id.startsWith('chrome ')) chromePath = result.stdout.trim().split('\n').at(-1);
      lines.line(`browsers: ${step.id}${step.id.startsWith('chrome ') || step.id.startsWith('firefox ') ? ` at ${result.stdout.trim().split('\n').at(-1)}` : ''} in ${formatSeconds(result.elapsedMs)}`);
      lines.pass(step.id, result.elapsedMs);
    }
  } catch (error) {
    lines.line(error.message);
    failed = true;
  }
  lines.close('browsers');
  process.exitCode = failed ? 1 : 0;
}
