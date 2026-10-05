// The PHP record server launcher (servers/php/main.mjs) learns that PHP-FPM and nginx accept
// connections from their own readiness lines on standard error, without connection attempts and
// without a time limit. Stand-in `php-fpm` and `nginx` programs on PATH write those lines only
// after the launcher has written the configuration files, and accept no connection at all.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../servers/php/main.mjs');

function sandbox(t, programs) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'crudui-php-server-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(programs)) {
    writeFileSync(path.join(root, name), `#!${process.execPath}\n${source}\n`);
    chmodSync(path.join(root, name), 0o755);
  }
  return root;
}

/** Start the launcher; resolve with its first stdout line or its exit with its output. */
function launch(root) {
  const child = spawn(process.execPath, [launcher, '127.0.0.1:1', path.join(root, 'run')], {
    env: { ...process.env, PATH: `${root}:${process.env.PATH}`, FORM_PHP_SERVER: 'php' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  return new Promise(resolve => {
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      if (output.includes('CRUDUI_READY')) resolve({ child, ready: true, output });
    });
    child.once('exit', code => resolve({ child, ready: false, code, output }));
  });
}

// A program that writes its readiness line, then waits until it is stopped.
const ready = line => `process.stderr.write(${JSON.stringify(`${line}\n`)}); setInterval(() => {}, 1000);`;

test('the PHP server is ready when PHP-FPM and nginx write their readiness lines', async t => {
  const root = sandbox(t, {
    'php-fpm': ready('[05-Oct-2026 11:27:58] NOTICE: ready to handle connections'),
    nginx: ready('2026/10/05 11:28:06 [notice] 24002#0: start worker processes'),
  });
  const result = await launch(root);
  t.after(() => result.child.kill('SIGTERM'));
  assert.equal(result.ready, true, result.output);
  assert.match(result.output, /NOTICE: ready to handle connections/);
  assert.match(result.output, /start worker processes/);
});

test('the PHP server fails when a process exits before its readiness line', async t => {
  const root = sandbox(t, {
    'php-fpm': "process.stderr.write('ERROR: failed to open configuration file\\n'); process.exitCode = 78;",
    nginx: ready('2026/10/05 11:28:06 [notice] 24002#0: start worker processes'),
  });
  const result = await launch(root);
  assert.equal(result.ready, false, result.output);
  assert.equal(result.code, 1);
  assert.match(result.output, /\[php\] php-fpm exited: 78/);
});
