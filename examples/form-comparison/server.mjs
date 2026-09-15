import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { encodeJson } from './src/json.mjs';
import { formServers } from './src/runtime-paths.mjs';
import { publicDirectory, publicPort, serverRequest } from './src/server-layout.mjs';
import { handler as displayConsoleHandler } from '../cross-check-console/server/server.mjs';
import { bindButtons, bindForm, compileForm, createForm, formMessages } from '@crudui/generator-core';
import { renderForm, renderFormView } from '@crudui/generator-html';
import { pipelineRecords, renderPipelineDetail, renderPipelineList } from './src/pipeline.mjs';

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

let jsData = { name: 'Ada', status: 'active', joined: '2026-01-02', score: 1234567.5 };
async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (Buffer.concat(chunks).length > 2 * 1024 * 1024) throw new Error('Request exceeds 2 MiB');
  const raw = Buffer.concat(chunks).toString();
  return raw === '' ? {} : JSON.parse(raw);
}
async function handleJsApi(url, request, response) {
  const match = /^\/api\/js\/(load|save|validate|reset|compile|render|ssr)\/(bindForm|createForm)\/(html|react|vue|svelte)$/.exec(url.pathname);
  if (!match) return false;
  const [, action] = match;
  const spec = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(publicDirectory, 'spec.json'), 'utf8'));
  if (action === 'load') return respond(response, 200, { server: 'js', storage: {}, data: jsData, generator: { runtime: 'js' } });
  if (action === 'reset') { jsData = { name: 'Ada', status: 'active', joined: '2026-01-02', score: 1234567.5 }; return respond(response, 200, { server: 'js', storage: {}, data: jsData, generator: { runtime: 'js' } }); }
  if (action === 'ssr') {
    const frameFile = path.join(publicDirectory, 'frames', `${match[2]}-${match[3]}`, 'index.html');
    const frame = await (await import('node:fs/promises')).readFile(frameFile, 'utf8');
    const template = compileForm(spec, { keyPrefix: 'form' });
    const form = createForm(template, jsData, { language: url.searchParams.get('lang') || 'ko' });
    const payload = JSON.stringify({ data: form.getData(), generator: { runtime: 'js' } }).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    const locale = url.searchParams.get('lang') || 'ko';
    const fields = bindForm(template, jsData, { language: locale });
    response.end(frame.replace('<html>', `<html lang="${locale}">`).replace('<div id="form-view"></div>', `<div id="form-view">${renderFormView(fields, bindButtons(template, jsData, { language: locale }), formMessages(locale))}</div>`).replace('</body>', `<script type="application/json" id="crudui-ssr">${payload}</script></body>`));
    return true;
  }
  const body = await readBody(request);
  if (action === 'compile') return respond(response, 200, { server: 'js', template: compileForm(body.spec || spec, body.options || {}) });
  if (action === 'render') { const form = createForm(body.template, body.data || {}, body.options || {}); return respond(response, 200, { server: 'js', data: form.getData(), fields: form.getFields(), html: renderForm(form), revision: form.getRevision(), generator: { runtime: 'js' } }); }
  if (action === 'validate') return respond(response, 200, { server: 'js', received: body.form || {}, normalized: body.form || {}, validation: { valid: true, errors: [] }, generator: { runtime: 'js' } });
  if (action === 'save') { jsData = body.form || body.data || jsData; return respond(response, 200, { server: 'js', data: jsData, storage: {}, validation: { valid: true, errors: [] }, generator: { runtime: 'js' } }); }
  return respond(response, 404, { error: 'Unknown endpoint', server: 'js' });
}

function pipelineOptions(url) {
  const options = {
    lang: url.searchParams.get('lang') === 'en' ? 'en' : 'ko',
    server: url.searchParams.get('server') || 'js',
    framework: url.searchParams.get('framework') || 'html',
    initialization: url.searchParams.get('initialization') || 'csr',
  };
  if (!formServers.includes(options.server) && options.server !== 'js') throw new Error('Unknown pipeline server');
  return options;
}

async function handlePipeline(url, request, response) {
  const match = /^\/api\/pipeline\/(list|detail)$/.exec(url.pathname);
  if (!match) return false;
  if (request.method !== 'GET') return respond(response, 405, { error: 'Method not allowed' });
  const options = pipelineOptions(url);
  const records = pipelineRecords();
  if (match[1] === 'list') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(renderPipelineList(records, options));
    return true;
  }
  const record = records.find(item => item.id === (url.searchParams.get('id') || '1'));
  if (!record) return respond(response, 404, { error: 'Record not found' });
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(renderPipelineDetail(record, options));
  return true;
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml' };
const httpServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/benchmark-console' || url.pathname === '/benchmark-console/') {
      response.writeHead(302, { Location: '/benchmark-console/index.html', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (url.pathname.startsWith('/benchmark-console/')) {
      const originalUrl = request.url;
      request.url = originalUrl.slice('/benchmark-console'.length) || '/';
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
    if (url.pathname.startsWith('/api/js/')) {
      if (state.status !== 'ready') return respond(response, 503, { status: state.status, error: state.error });
      await handleJsApi(url, request, response);
      return;
    }
    if (url.pathname.startsWith('/api/pipeline/')) {
      if (state.status !== 'ready') return respond(response, 503, { status: state.status, error: state.error });
      await handlePipeline(url, request, response);
      return;
    }
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
    const pagePath = ['/detail', '/detail/', '/form', '/form/'].includes(url.pathname) ? '/index.html' : url.pathname;
    let file = path.resolve(publicDirectory, `.${decodeURIComponent(pagePath)}`);
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
