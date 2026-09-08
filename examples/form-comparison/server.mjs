import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { encodeJson } from './src/json.mjs';

const publicDir = '/workspace/public';
const metadata = JSON.parse(await readFile('/workspace/metadata.json', 'utf8'));
const revisions = ['original', 'corrected', 'keyed'];
const ports = { php: { original: 8081, corrected: 8081, keyed: 8081 }, 'php-ext': { original: 8088, corrected: 8088, keyed: 8088 }, go: {}, rust: {} };
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
    if (url.pathname === '/api/health') return respond(response, 200, { status: 'ok', servers: ['php', 'php-ext', 'go', 'rust'] });
    const match = url.pathname.match(/^\/api\/(php|php-ext|go|rust)\/(load|save|validate|reset)\/(corrected|original|original-keyed|keyed)\/(react|vue|svelte)$/);
    if (match) {
      const [, server, action, mode, framework] = match;
      const revision = mode === 'original-keyed' ? 'original' : mode;
      const port = ports[server][revision];
      const outgoing = http.request({ hostname: '127.0.0.1', port, path: `/api/${action}/${mode}/${framework}`, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${port}` } }, incoming => {
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
    let file = path.resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
    if (file !== publicDir && !file.startsWith(`${publicDir}/`)) return respond(response, 404, { error: 'Unknown file' });
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
for (const mode of ['php', 'php-ext']) {
  const extension = mode === 'php-ext' ? ['-d', 'extension=/opt/sortjson.so'] : [];
  start('php', [...extension, '-d', 'max_input_vars=10000', '-d', 'post_max_size=2M', '-S', `127.0.0.1:${ports[mode].keyed}`, '-t', publicDir, '/workspace/keyed/examples/form-comparison/api.php'], { FORM_PHP_SERVER: mode });
}
for (const [language, offset] of [['go', 8082], ['rust', 8085]]) {
  for (const [index, revision] of revisions.entries()) {
    const port = offset + index;
    ports[language][revision] = port;
    start(`/workspace/bin/${language}-${revision}`, [`127.0.0.1:${port}`, '/data', publicDir]);
  }
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
for (const server of ['php', 'php-ext', 'go', 'rust']) {
  for (const revision of revisions) {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${ports[server][revision]}/api/health`);
        const value = await response.json();
        ready = response.ok && value.server === server && (server.startsWith('php') || value.commit === metadata[revision].commit);
        if (server.startsWith('php')) ready = ready && value.nativeJson === (server === 'php-ext');
        if (ready) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) { process.stderr.write(`${server}/${revision} did not become ready\n`); stop(1); throw new Error('Server startup failed'); }
  }
}
httpServer.listen(8080, '0.0.0.0');
