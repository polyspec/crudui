// The PHP record server launcher (servers/php/main.mjs) learns that PHP-FPM and nginx accept
// connections from their own readiness lines on standard error, without connection attempts and
// without a time limit. The fixture provides the module-declared php-config and PHP-FPM paths
// and nginx on PATH; the programs accept no connection at all.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../servers/php/main.mjs');

function sandbox(programs) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'crudui-php-server-'));
  const fixtureLauncher = path.join(root, 'examples/form-comparison/servers/php/main.mjs');
  mkdirSync(path.dirname(fixtureLauncher), { recursive: true });
  copyFileSync(launcher, fixtureLauncher);
  const phpConfig = path.join(root, 'var/tools/bin/php-config');
  mkdirSync(path.dirname(phpConfig), { recursive: true });
  writeFileSync(phpConfig, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(root)});\n`);
  chmodSync(phpConfig, 0o755);
  for (const [name, source] of Object.entries(programs)) {
    const file = name === 'php-fpm' ? path.join(root, 'sbin', name) : path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `#!${process.execPath}\n${source}\n`);
    chmodSync(file, 0o755);
  }
  return root;
}

/** Start the launcher; resolve with its first stdout line or its exit with its output. */
function launch(t, root, env = {}) {
  const fixtureLauncher = path.join(root, 'examples/form-comparison/servers/php/main.mjs');
  const child = spawn(process.execPath, [fixtureLauncher, '127.0.0.1:0', path.join(root, 'run')], {
    env: { ...process.env, PATH: `${root}:${process.env.PATH}`, FORM_PHP_SERVER: 'php', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    try {
      if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  let output = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  return new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      if (output.includes('CRUDUI_READY')) resolve({ child, ready: true, output });
    });
    child.once('error', reject);
    child.once('exit', code => resolve({ child, ready: false, code, output }));
  });
}

// A program that writes its readiness line, then waits until it is stopped.
const ready = line => `process.stderr.write(${JSON.stringify(`${line}\n`)}); setInterval(() => {}, 1000);`;

test('the PHP server is ready when PHP-FPM and nginx write their readiness lines', async t => {
  const root = sandbox({
    'php-fpm': ready('[05-Oct-2026 11:27:58] NOTICE: ready to handle connections'),
    // nginx receives the listening socket of the launcher as file descriptor 3, named by NGINX.
    nginx: "const fs = require('node:fs'); fs.writeFileSync(process.argv[process.argv.indexOf('-p') + 1] + '/INHERITED', "
      + "JSON.stringify({ nginx: process.env.NGINX, socket: fs.fstatSync(3).isSocket() }));\n"
      + ready('2026/10/05 11:28:06 [notice] 24002#0: start worker processes'),
  });
  const result = await launch(t, root);
  assert.equal(result.ready, true, result.output);
  // The launcher took a port of the system for 127.0.0.1:0, wrote it into the nginx configuration and names it.
  const [, port] = /CRUDUI_READY php 127\.0\.0\.1:(\d+)/.exec(result.output) ?? [];
  assert.ok(Number(port) > 0, result.output);
  assert.match(readFileSync(path.join(root, 'run', 'nginx.conf'), 'utf8'), new RegExp(`listen 127\\.0\\.0\\.1:${port};`));
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'run', 'INHERITED'), 'utf8')), { nginx: '3;', socket: true });
  assert.match(result.output, /NOTICE: ready to handle connections/);
  assert.match(result.output, /start worker processes/);
});

test('the PHP server fails when a process exits before its readiness line', async t => {
  const root = sandbox({
    'php-fpm': "process.stderr.write('ERROR: failed to open configuration file\\n'); process.exitCode = 78;",
    nginx: ready('2026/10/05 11:28:06 [notice] 24002#0: start worker processes'),
  });
  const result = await launch(t, root);
  assert.equal(result.ready, false, result.output);
  assert.equal(result.code, 1);
  assert.match(result.output, /\[php\] php-fpm exited: 78/);
});

test('the PHP server reports a failed cleanup when it stops and exits with status 1', async t => {
  // The stand-in PHP-FPM leaves a directory that cannot be emptied beside its socket, so removing the
  // socket directory fails when the launcher stops.
  const root = sandbox({
    'php-fpm': "const fs = require('node:fs'); const path = require('node:path');\n"
      + "const config = fs.readFileSync(process.argv[process.argv.indexOf('-y') + 1], 'utf8');\n"
      + "const locked = path.join(path.dirname(/^listen = (.*)$/m.exec(config)[1]), 'locked');\n"
      + "fs.mkdirSync(locked); fs.writeFileSync(path.join(locked, 'file'), ''); fs.chmodSync(locked, 0o500);\n"
      + ready('[05-Oct-2026 11:27:58] NOTICE: ready to handle connections'),
    nginx: ready('2026/10/05 11:28:06 [notice] 24002#0: start worker processes'),
  });
  const temporary = path.join(root, 'tmp');
  mkdirSync(temporary);
  let output;
  let code;
  try {
    const result = await launch(t, root, { TMPDIR: temporary });
    assert.equal(result.ready, true, result.output);
    output = result.output;
    result.child.stderr.on('data', chunk => { output += chunk; });
    const exited = new Promise(resolve => result.child.once('exit', resolve));
    result.child.kill('SIGTERM');
    code = await exited;
  } finally {
    // The sandbox removal (an earlier after hook) needs the locked directory writable again.
    for (const directory of readdirSync(temporary)) {
      const locked = path.join(temporary, directory, 'locked');
      if (existsSync(locked)) chmodSync(locked, 0o700);
    }
  }
  assert.equal(code, 1, output);
  assert.match(output, /\[php\] stopping failed: .*EACCES/, output);
  assert.doesNotMatch(output, /triggerUncaughtException|UnhandledPromiseRejection/, output);
});
