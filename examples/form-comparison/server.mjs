// The public server (docs/spec/form-comparison.md, "Record servers" and "Canonical page"):
//   node server.mjs {address} {data directory} {public directory} {native server ports as JSON}
// It serves the canonical page and the benchmark screens, answers the `js` records itself and
// forwards the other API requests to the native servers. The build state arrives over IPC.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { encodeJson } from './src/json.mjs';
import {
  recordClients, recordInitializations, recordModes, recordServers, selectionQuery,
} from './src/record-contract.mjs';
import { formServers } from './src/runtime-paths.mjs';
import { serverRequest } from './src/server-layout.mjs';
import { recordStore } from './servers/javascript/records.mjs';

const [address, dataDirectory, publicArgument, portsArgument] = process.argv.slice(2);
const separator = address?.lastIndexOf(':') ?? -1;
if (process.argv.length !== 6 || separator < 1) {
  throw new Error('Usage: node server.mjs {host:port} {data directory} {public directory} {ports JSON}');
}
const publicDirectory = path.resolve(publicArgument);
const ports = JSON.parse(portsArgument);
for (const server of formServers) {
  if (!Number.isSafeInteger(ports[server])) throw new Error(`The port of ${server} is missing`);
}
const jsRecords = recordStore({ server: 'js', dataDirectory, publicDirectory });

// The supervisor sends its state after every change; this process never reads it from disk.
let state = { status: 'building', cycle: 0, source: null, error: null };
process.on('message', message => {
  state = message;
});
process.on('disconnect', () => process.exit(0));

function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(encodeJson(value));
}


class PageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const pageViews = new Map([['/', 'list'], ['/detail', 'detail'], ['/form', 'form']]);
const positiveInteger = /^[1-9][0-9]*$/;
const selectionMembers = {
  lang: { values: ['ko', 'en'], fallback: 'ko' },
  server: { values: recordServers, fallback: 'js' },
  framework: { values: recordClients, fallback: 'html' },
  initialization: { values: recordInitializations, fallback: 'csr' },
  mode: { values: recordModes, fallback: 'bindForm' },
};

/** The selection of one page address; a missing member takes its default. */
function pageSelection(view, search) {
  const allowed = [...(view === 'list' ? ['saved'] : ['id']), ...Object.keys(selectionMembers), 'page'];
  const query = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (!allowed.includes(key) || Object.hasOwn(query, key)) throw new PageError(400, `Unexpected query member ${key}`);
    query[key] = value;
  }
  const selection = {};
  for (const [key, { values, fallback }] of Object.entries(selectionMembers)) {
    selection[key] = query[key] ?? fallback;
    if (!values.includes(selection[key])) throw new PageError(400, `Unknown ${key}: ${selection[key]}`);
  }
  const page = query.page ?? '1';
  if (!positiveInteger.test(page)) throw new PageError(400, `Invalid page: ${page}`);
  selection.page = Number(page);
  for (const key of ['id', 'saved']) {
    if (query[key] !== undefined && !positiveInteger.test(query[key])) throw new PageError(400, `Invalid ${key}: ${query[key]}`);
  }
  if (view !== 'list' && query.id === undefined) throw new PageError(400, 'The page requires an id');
  return { selection, id: query.id ?? null, saved: query.saved ?? null };
}

/** One JSON read of a record server's own API (`/api/records…`). */
async function readRecords(server, target) {
  if (server === 'js') {
    const url = new URL(target, 'http://localhost');
    const view = /^\/api\/records\/view\/(.+)$/.exec(url.pathname);
    if (view) return jsRecords.call('view', view[1], url.search);
    const record = /^\/api\/records\/(.+)$/.exec(url.pathname);
    if (record) return jsRecords.call('record', record[1]);
    return jsRecords.call('list', Number(url.searchParams.get('page')));
  }
  return new Promise((resolve, reject) => {
    const outgoing = http.get({ hostname: '127.0.0.1', port: ports[server], path: target }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => {
        try {
          resolve({ status: incoming.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (error) {
          reject(new Error(`${server} answered ${target} without JSON`, { cause: error }));
        }
      });
    });
    outgoing.on('error', reject);
  });
}

/** The stage data of the page from the selected server, or the page's 404 and 502 failures. */
async function stageSource(view, { selection, id }) {
  const target = selection.initialization === 'ssr'
    ? `/api/records/view/${view}?${view === 'list' ? '' : `id=${id}&`}${selectionQuery(selection)}`
    : view === 'list' ? `/api/records?page=${selection.page}` : `/api/records/${id}`;
  const result = await readRecords(selection.server, target);
  if (result.status === 404) throw new PageError(404, result.json.error);
  if (result.status !== 200) {
    throw new PageError(502, `${selection.server} answered ${target} with ${result.status}: ${result.json.error}`);
  }
  return result.json;
}

const escapeScriptJson = value => JSON.stringify(value)
  .replace(/[<>&]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);

const savedNotice = {
  ko: id => `레코드 ${id}을(를) 저장했습니다.`,
  en: id => `Saved record ${id}.`,
};

/** Select the option of one selection control in the page template. */
function selectOption(html, control, value) {
  return html.replace(new RegExp(`(<select id="${control}"[^>]*>)([\\s\\S]*?)(</select>)`), (_, open, options, close) =>
    open + options.replaceAll(' selected', '').replace(`value="${value}"`, `value="${value}" selected`) + close);
}

/**
 * The initial document of one page. SSR writes the selected server's stage HTML and its data;
 * CSR leaves the stage empty for the selected client.
 */
async function pageDocument(view, request) {
  const { selection, saved } = request;
  const source = await stageSource(view, request);
  let html = await readFile(path.join(publicDirectory, 'index.html'), 'utf8');
  html = html.replace(/<html[^>]*>/,
    `<html lang="${selection.lang}" data-pipeline-initialization="${selection.initialization}">`);
  for (const control of Object.keys(selectionMembers)) {
    if (control !== 'lang') html = selectOption(html, control, selection[control]);
  }
  const stage = /<section id="stage"([^>]*)><\/section>/.exec(html);
  if (!stage) throw new Error('The page template has no empty stage section');
  const attributes = stage[1].replace(/\s+data-view="[^"]*"/, '');
  const ssr = selection.initialization === 'ssr';
  const notice = ssr && view === 'list' && saved !== null
    ? `<p id="saved-notice" role="status" data-record-id="${saved}">${savedNotice[selection.lang](saved)}</p>` : '';
  const data = ssr
    ? `<script type="application/json" id="crudui-stage-data">${escapeScriptJson(source.data)}</script>` : '';
  const replacement = `${notice}<section id="stage" data-view="${view}"${attributes}>${ssr ? source.html : ''}</section>${data}`;
  return html.slice(0, stage.index) + replacement + html.slice(stage.index + stage[0].length);
}

async function servePage(view, url, request, response) {
  if (request.method !== 'GET') return respond(response, 405, { error: 'Method not allowed' });
  try {
    const html = await pageDocument(view, { view, ...pageSelection(view, url.search) });
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch (error) {
    if (!(error instanceof PageError)) throw error;
    respond(response, error.status, { error: error.message });
  }
}

function forward(target, request, response) {
  // A server may answer before it has read the whole body, as an oversized request's 413. Once it
  // has answered, its answer is the response: the rest of the upload stops, and a failed write of
  // that rest does not cut the answer.
  let answered = false;
  const outgoing = http.request({
    hostname: '127.0.0.1', port: target.port, path: target.path, method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${target.port}` },
  }, incoming => {
    answered = true;
    request.unpipe(outgoing);
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
    incoming.on('error', error => response.destroy(error));
  });
  outgoing.on('error', error => {
    if (answered) return;
    if (!response.headersSent) respond(response, 502, { error: error.message, server: target.server });
    else response.destroy(error);
  });
  request.on('aborted', () => outgoing.destroy());
  request.pipe(outgoing);
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml' };
const httpServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/benchmark-console' || url.pathname === '/benchmark-console/') {
      response.writeHead(302, { Location: `/benchmark-console/index.html${url.search}`, 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (url.pathname === '/api/health') {
      return state.status === 'ready'
        ? respond(response, 200, { status: 'ok', servers: formServers })
        : respond(response, 503, { status: state.status, error: state.error });
    }
    if (url.pathname === '/api/js/records' || url.pathname.startsWith('/api/js/records/')) {
      if (state.status !== 'ready') return respond(response, 503, { status: state.status, error: state.error, server: 'js' });
      return await jsRecords.handle(request, response, `/api${url.pathname.slice('/api/js'.length)}`, url.search);
    }
    const view = pageViews.get(url.pathname);
    if (view) return await servePage(view, url, request, response);
    // The request path is fixed by the layout; the port is the one this server was started with.
    const target = serverRequest(url.pathname, url.search);
    if (target) return forward({ ...target, port: ports[target.server] }, request, response);
    if (url.pathname.startsWith('/api/')) return respond(response, 404, { error: 'Unknown endpoint' });
    if (!['GET', 'HEAD'].includes(request.method)) return respond(response, 405, { error: 'Method not allowed' });
    // The page template is served only as a rendered page.
    if (url.pathname === '/index.html') return respond(response, 404, { error: 'Unknown file' });
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
httpServer.listen(Number(address.slice(separator + 1)), address.slice(0, separator),
  () => process.stderr.write('CRUDUI_READY public\n'));
