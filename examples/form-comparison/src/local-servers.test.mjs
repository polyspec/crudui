// A local stack never outlives the test process that started it: a process that ends without
// stopping its servers, for example after a failed hook and a forced exit, stops every server it
// started. The case starts a stand-in server through `startProcess` in a child process that then
// exits; the server holds the write end of a named pipe, so the end of the read side shows that it
// is gone, and the case's own timeout fails a server that survives.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const localServers = pathToFileURL(path.join(import.meta.dirname, 'local-servers.mjs')).href;

test('a process that exits without stopping its local servers stops them', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-local-servers-'));
  const pipe = path.join(directory, 'held');
  await promisify(execFile)('mkfifo', [pipe]);
  // The stand-in server records its process id, opens the pipe, listens, announces readiness and
  // runs until it is stopped. A stand-in that survives a failed case is stopped after it, which
  // also ends the read side of the pipe.
  const pidFile = path.join(directory, 'stand-in.pid');
  t.after(async () => {
    let pid;
    try { pid = Number(await readFile(pidFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (pid) try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await rm(directory, { recursive: true, force: true });
  });
  const server = [
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    `require('node:fs').openSync(${JSON.stringify(pipe)}, 'w');`,
    "const [host, port] = process.argv[1].split(':');",
    "require('node:http').createServer((request, response) => response.end('ok'))",
    "  .listen(Number(port), host, () => console.log('CRUDUI_READY stand-in'));",
  ].join('\n');
  const script = path.join(directory, 'stack.mjs');
  await writeFile(script, [
    `import { freePort, startProcess } from ${JSON.stringify(localServers)};`,
    'const address = `127.0.0.1:${await freePort()}`;',
    `await startProcess({ server: 'stand-in', address, command: process.execPath, args: ['-e', ${JSON.stringify(server)}, address], environment: {}, ready: /^CRUDUI_READY stand-in$/m }, { write: () => {} });`,
    // The process ends without stopping the server, as a forced exit after a failed hook does.
    'process.exit(0);',
  ].join('\n'));
  const held = createReadStream(pipe);
  const gone = new Promise(resolve => held.once('end', resolve).resume());
  const stack = spawn(process.execPath, [script], { stdio: ['ignore', 'inherit', 'inherit'] });
  const exited = new Promise(resolve => stack.once('exit', resolve));
  assert.equal(await exited, 0);
  await gone;
});
