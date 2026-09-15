import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { encodeJson } from './src/json.mjs';
import { formServers } from './src/runtime-paths.mjs';
import { publicDirectory, publicPort, serverRequest } from './src/server-layout.mjs';
import { handler as displayConsoleHandler } from '../cross-check-console/server/server.mjs';

// The supervisor sends its state after every change; this process never reads it from disk.
let state = { status: 'building', cycle: 0, source: null, error: null };
const waiting = new Set();
process.on('message', message => {
  state = message;
  if (state.status === 'building') return;
  for (const resume of waiting) resume();
  waiting.clear();
});
process.on('disconnect', () => process.exit(0));

function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(encodeJson(value));
}

/** Answer with the state of the current build cycle once it is no longer building. */
function respondSource(request, response) {
  const send = () => respond(response, state.status === 'ready' ? 200 : 503, state);
  if (state.status !== 'building') return send();
  waiting.add(send);
  request.on('close', () => waiting.delete(send));
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml' };
const httpServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/displays') {
      response.writeHead(302, { Location: '/displays/', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (url.pathname.startsWith('/displays/api/')) {
      const originalUrl = request.url;
      request.url = originalUrl.slice('/displays'.length) || '/';
      try {
        await displayConsoleHandler(request, response);
      } finally {
        request.url = originalUrl;
      }
      return;
    }
    if (url.pathname === '/api/health') {
      return state.status === 'ready'
        ? respond(response, 200, { status: 'ok', servers: formServers })
        : respond(response, 503, { status: state.status, error: state.error });
    }
    if (url.pathname === '/api/source') return respondSource(request, response);
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
    response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
  } catch (error) {
    if (!response.headersSent) respond(response, error.code === 'ENOENT' ? 404 : 500, { error: error.message });
    else response.destroy(error);
  }
});
process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));
httpServer.listen(publicPort, '0.0.0.0', () => process.stderr.write('CRUDUI_READY public\n'));
