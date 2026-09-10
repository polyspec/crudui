import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { encodeJson } from './src/json.mjs';
import { formServers } from './src/runtime-paths.mjs';
import {
  publicDirectory, serverPorts, serverProcesses, serverRequest, sourceArchiveFile,
} from './src/server-layout.mjs';
import { readSourceArchiveCommit, serverReady, sourceArchiveReady } from './src/server-startup.mjs';

const metadata = JSON.parse(await readFile('/workspace/metadata.json', 'utf8'));
const archive = await readFile(sourceArchiveFile);
const archiveSha256 = createHash('sha256').update(archive).digest('hex');
const archiveCommit = readSourceArchiveCommit(sourceArchiveFile);
if (!sourceArchiveReady(metadata, archiveSha256, archiveCommit)) throw new Error('The deployed source archive differs from metadata');
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const cruduiModuleSha256 = await digest('/opt/crudui.so');
metadata.cruduiModuleSha256 = cruduiModuleSha256;
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
  if (httpServer.listening) httpServer.close();
}
function start(command, args, environment = {}) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...environment } });
  child.on('error', error => { process.stderr.write(`${error.message}\n`); stop(1); });
  child.on('exit', code => { if (!stopping) { process.stderr.write(`${command} exited ${code}\n`); stop(1); } });
  children.push(child);
}
function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(encodeJson(value));
}
const httpServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/health') return respond(response, 200, { status: 'ok', servers: formServers });
    const target = serverRequest(url.pathname, url.search);
    if (target) {
      const outgoing = http.request({ hostname: '127.0.0.1', port: target.port, path: target.path, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${target.port}` } }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      outgoing.on('error', error => { if (!response.headersSent) respond(response, 502, { error: error.message }); else response.destroy(error); });
      request.on('aborted', () => outgoing.destroy());
      request.pipe(outgoing);
      return;
    }
    if (url.pathname.startsWith('/api/')) return respond(response, 404, { error: 'Unknown endpoint' });
    if (!['GET', 'HEAD'].includes(request.method)) return respond(response, 405, { error: 'Method not allowed' });
    let file = path.resolve(publicDirectory, `.${decodeURIComponent(url.pathname)}`);
    if (file !== publicDirectory && !file.startsWith(`${publicDirectory}/`)) return respond(response, 404, { error: 'Unknown file' });
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    if (!(await stat(file)).isFile()) return respond(response, 404, { error: 'Unknown file' });
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
  } catch (error) {
    if (!response.headersSent) respond(response, error.code === 'ENOENT' ? 404 : 500, { error: error.message });
    else response.destroy(error);
  }
});
for (const process of serverProcesses(archiveSha256, cruduiModuleSha256)) {
  start(process.command, process.args, process.environment);
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
let phpSignatures;
for (const server of formServers) {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPorts[server]}/api/health`);
      const value = await response.json();
      ready = serverReady(server, response.ok, value, metadata, phpSignatures);
      if (ready && server === 'php' && phpSignatures === undefined) phpSignatures = value.generator.signatures;
      if (ready) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { process.stderr.write(`${server} did not become ready\n`); stop(1); throw new Error('Server startup failed'); }
}
httpServer.listen(8080, '0.0.0.0');
