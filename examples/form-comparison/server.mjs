import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { encodeJson } from './src/json.mjs';
import { formFrameworks, formInitializations, formServers, pipelineServers } from './src/runtime-paths.mjs';
import { publicDirectory, publicPort, serverPorts, serverRequest } from './src/server-layout.mjs';
import { bindButtons, bindForm, compileForm, createForm, formMessages } from '@crudui/generator-core';
import { renderForm, renderFormView } from '@crudui/generator-html';
import { pipelineDetailSpec, pipelineListSpec, pipelineRecords, renderPipelineDetail, renderPipelineList } from './src/pipeline.mjs';

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
  if (!pipelineServers.includes(options.server)) throw new Error('Unknown pipeline server');
  if (!formFrameworks.includes(options.framework)) throw new Error('Unknown pipeline framework');
  if (!formInitializations.includes(options.initialization)) throw new Error('Unknown pipeline initialization');
  return options;
}

async function handlePipeline(url, request, response) {
  const match = /^\/api\/pipeline\/(list|detail)$/.exec(url.pathname);
  if (!match) return false;
  if (request.method !== 'GET') return respond(response, 405, { error: 'Method not allowed' });
  const rendered = await pipelineMarkup(url, match[1]);
  response.writeHead(rendered.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(rendered.body);
  return true;
}

async function pipelineMarkup(url, view) {
  const options = pipelineOptions(url);
  const records = pipelineRecords();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
  if (!Number.isSafeInteger(page) || page > Math.ceil(records.length / 20)) return { status: 404, body: 'Page not found' };
  const rows = view === 'list' ? records.slice((page - 1) * 20, page * 20) : records;
  const record = records.find(item => item.id === (url.searchParams.get('id') || '1'));
  if (view === 'detail' && !record) return { status: 404, body: 'Record not found' };
  if (options.server === 'js') {
    return { status: 200, body: view === 'list'
      ? renderPipelineList(rows, { ...options, page, total: records.length }) : renderPipelineDetail(record, options) };
  }
  const payload = { spec: view === 'list' ? pipelineListSpec(options) : pipelineDetailSpec(options),
    rows, record, options: { language: options.lang, layout: 'table', page, total: records.length } };
  const native = await new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: serverPorts[options.server],
      path: `/api/pipeline/${view}`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, incoming => {
      const chunks = []; incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject); outgoing.end(JSON.stringify(payload));
  });
  return native;
}

async function renderPipelinePage(url, request, response) {
  const match = url.pathname === '/' || url.pathname === '/index.html' ? 'list'
    : url.pathname === '/detail' || url.pathname === '/detail/' ? 'detail'
      : url.pathname === '/form' || url.pathname === '/form/' ? 'form' : null;
  if (!match || request.method !== 'GET') return false;
  const options = pipelineOptions(url);
  let html = await (await import('node:fs/promises')).readFile(path.join(publicDirectory, 'index.html'), 'utf8');
  const language = options.lang;
  const labels = language === 'en'
    ? { title: 'CRUDUI full feature example', intro: 'Use CRUDUI-generated list links to open detail and form, then verify the saved result in the list.', server: 'Server', framework: 'Client', initialization: 'Execution', source: 'Source identity', back: 'Back to list' }
    : { title: 'CRUDUI 전체 기능 예제', intro: 'CRUDUI가 생성한 목록 링크로 상세와 폼으로 이동하고 실제 저장 결과를 다시 목록에서 확인합니다.', server: '서버', framework: '클라이언트', initialization: '실행 방식', source: '소스 식별자', back: '목록으로 돌아가기' };
  html = html.replace('<html lang="ko">', `<html lang="${language}" data-pipeline-initialization="${options.initialization}">`)
    .replace('<title>CRUDUI · Pipeline example</title>', `<title>${labels.title}</title>`)
    .replace('<p class="eyebrow">CRUDUI EXAMPLE</p><h1 id="title"></h1><p id="intro"></p>', `<p class="eyebrow">CRUDUI EXAMPLE</p><h1 id="title">${labels.title}</h1><p id="intro">${labels.intro}</p>`)
    .replace('<label for="server" id="server-label"></label>', `<label for="server" id="server-label">${labels.server}</label>`)
    .replace('<label for="framework" id="framework-label"></label>', `<label for="framework" id="framework-label">${labels.framework}</label>`)
    .replace('<label for="initialization" id="initialization-label"></label>', `<label for="initialization" id="initialization-label">${labels.initialization}</label>`)
    .replace('<summary id="source-label">Source identity</summary>', `<summary id="source-label">${labels.source}</summary>`)
    .replace('<span id="back-list"></span>', `<span id="back-list">${labels.back}</span>`)
    .replace('value="js">JavaScript', `value="js"${options.server === 'js' ? ' selected' : ''}>JavaScript`)
    .replace(`value="${options.server}">`, `value="${options.server}" selected>`)
    .replace(`value="${options.framework}">`, `value="${options.framework}" selected>`)
    .replace(`value="${options.initialization}">`, `value="${options.initialization}" selected>`);
  const params = new URLSearchParams({ lang: options.lang, server: options.server, framework: options.framework, initialization: options.initialization, page: url.searchParams.get('page') || '1', id: url.searchParams.get('id') || '1' }).toString();
  html = html.replace('href="/"', `href="/?${params}"`).replace('href="/detail?id=1"', `href="/detail?id=1&${params}"`).replace('href="/form?id=1"', `href="/form?id=1&${params}"`);
  if (match === 'form') {
    html = html.replace('<section id="stage" aria-live="polite"></section>', '<section id="stage" aria-live="polite" hidden></section>')
      .replace('<section id="form-stage" class="form-stage" hidden>', '<section id="form-stage" class="form-stage">');
    if (options.initialization === 'ssr') {
      const frameQuery = new URLSearchParams({ lang: options.lang, server: options.server, initialization: options.initialization }).toString();
      html = html.replace('<iframe id="form-frame" title="CRUDUI form">', `<iframe id="form-frame" title="CRUDUI form" src="/api/${options.server}/ssr/bindForm/${options.framework}?${frameQuery}">`);
    }
  } else if (options.initialization === 'ssr') {
    const rendered = await pipelineMarkup(url, match);
    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const pageLinks = match === 'list' ? `<nav class="pipeline-pagination" aria-label="${language === 'en' ? 'Pages' : '페이지'}">${[1, 2, 3].map(value => `<a href="/?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), page: String(value) })}"${value === page ? ' aria-current="page"' : ''}>${value}</a>`).join('')}</nav>` : '';
    const stage = `<div class="stage-heading"><p class="eyebrow">${match.toUpperCase()}</p><h2>${match === 'list' ? (language === 'en' ? 'Customer list' : '고객 목록') : (language === 'en' ? 'Customer detail' : '고객 상세')}</h2><p>${labels.intro}</p></div>${rendered.body.toString()}${pageLinks}`;
    html = html.replace('<section id="stage" aria-live="polite"></section>', `<section id="stage" aria-live="polite">${stage}</section>`);
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
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
    if (await renderPipelinePage(url, request, response)) return;
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
