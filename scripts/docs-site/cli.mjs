#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDocumentationSite } from './build.mjs';
import { watchDocumentation } from './watch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = join(ROOT, 'docs');
const OUTPUT = join(DOCS, '.site', 'dist');
const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'], ['.woff2', 'font/woff2'],
]);

async function build() {
  const report = await buildDocumentationSite({ repositoryRoot: ROOT, docsDirectory: DOCS, outputDirectory: OUTPUT });
  process.stdout.write(`[docs-site] ${report.documents} documents, ${report.pages} pages, ${report.assets} assets\n`);
}

function argument(name, defaultValue) {
  const index = process.argv.indexOf(name);
  return index === -1 ? defaultValue : process.argv[index + 1];
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname).replaceAll('\\', '/');
  const path = normalize(decoded).replace(/^([/\\])+/, '');
  if (path === '..' || path.startsWith(`..${sep}`)) return undefined;
  return path;
}

async function responseFile(pathname) {
  const path = safePath(pathname);
  if (path === undefined) return undefined;
  const candidates = path === '' ? ['index.html']
    : extname(path) ? [path]
      : pathname.endsWith('/') ? [join(path, 'index.html')] : [`${path}.html`, join(path, 'index.html')];
  for (const candidate of candidates) {
    const filename = resolve(OUTPUT, candidate);
    const local = relative(OUTPUT, filename);
    if (local === '..' || local.startsWith(`..${sep}`)) continue;
    try {
      if ((await stat(filename)).isFile()) return filename;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

async function serve(development) {
  const host = argument('--host', '127.0.0.1');
  const port = Number(argument('--port', development ? '5173' : '4173'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  let sourceWatcher;
  let watchFailure;
  let handleRuntimeWatchFailure;
  const startupBuildFailures = [];
  let reportBuildError = error => startupBuildFailures.push(error);
  const receiveWatchFailure = error => {
    if (handleRuntimeWatchFailure) handleRuntimeWatchFailure(error);
    else watchFailure ??= error;
  };
  if (development) {
    sourceWatcher = watchDocumentation(DOCS, build, {
      paused: true,
      onBuildError: error => reportBuildError(error),
    });
    sourceWatcher.watcher.on('error', receiveWatchFailure);
  }
  try {
    await build();
    if (development) {
      sourceWatcher.resume();
      await sourceWatcher.idle();
      if (watchFailure) throw watchFailure;
      if (startupBuildFailures.length) throw startupBuildFailures.at(-1);
    }
  } catch (error) {
    sourceWatcher?.close();
    throw error;
  }
  if (development) {
    reportBuildError = error => {
      process.stderr.write(`[docs-site] rebuild failed: ${error.stack ?? error.message}\n`);
    };
  }
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, `http://${request.headers.host ?? host}`).pathname;
      const filename = await responseFile(pathname) ?? join(OUTPUT, '404.html');
      const missing = filename.endsWith('404.html');
      response.writeHead(missing ? 404 : 200, {
        'content-type': MIME.get(extname(filename)) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filename).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Documentation server error: ${error.message}\n`);
    }
  });
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, host, accept);
    });
  } catch (error) {
    sourceWatcher?.close();
    throw error;
  }
  process.stdout.write(`[docs-site] http://${host}:${port}/\n`);
  let stopping = false;
  const stop = (status = 0) => {
    if (stopping) return;
    stopping = true;
    sourceWatcher?.close();
    server.close(error => {
      if (error) {
        process.stderr.write(`[docs-site] server close failed: ${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      } else process.exitCode = status;
    });
  };
  if (development) {
    handleRuntimeWatchFailure = error => {
      process.stderr.write(`[docs-site] source watch failed: ${error.stack ?? error.message}\n`);
      stop(1);
    };
    if (watchFailure) handleRuntimeWatchFailure(watchFailure);
  }
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
}

const command = process.argv[2] ?? 'build';
if (command === 'build') await build();
else if (command === 'dev') await serve(true);
else if (command === 'preview') await serve(false);
else throw new Error('Use build, dev or preview');
