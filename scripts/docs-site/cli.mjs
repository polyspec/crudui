#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDocumentationSite } from './build.mjs';

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

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
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

async function snapshot(directory) {
  const entries = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = join(current, entry.name);
      if (entry.name === '.site') continue;
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        const info = await stat(filename);
        entries.push(`${relative(directory, filename)}:${info.size}:${info.mtimeMs}`);
      }
    }
  }
  await visit(directory);
  return entries.join('|');
}

async function serve(watch) {
  await build();
  const host = argument('--host', '127.0.0.1');
  const port = Number(argument('--port', watch ? '5173' : '4173'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
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
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  });
  process.stdout.write(`[docs-site] http://${host}:${port}/\n`);
  let timer;
  let previous = watch ? await snapshot(DOCS) : undefined;
  let rebuilding = false;
  if (watch) {
    timer = setInterval(async () => {
      if (rebuilding) return;
      const current = await snapshot(DOCS);
      if (current === previous) return;
      rebuilding = true;
      try {
        await build();
        previous = current;
      } catch (error) {
        process.stderr.write(`[docs-site] rebuild failed: ${error.stack ?? error.message}\n`);
      } finally {
        rebuilding = false;
      }
    }, 500);
    timer.unref();
  }
  const stop = () => {
    if (timer) clearInterval(timer);
    server.close(error => {
      if (error) throw error;
      process.exit(0);
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const command = process.argv[2] ?? 'build';
if (command === 'build') await build();
else if (command === 'dev') await serve(true);
else if (command === 'preview') await serve(false);
else throw new Error('Use build, dev or preview');
