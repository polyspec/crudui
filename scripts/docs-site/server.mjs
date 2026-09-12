import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';

import { documentationBasePath } from './paths.mjs';

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'], ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'], ['.woff', 'font/woff'], ['.ttf', 'font/ttf'],
]);

export function createDocumentationServer({ outputDirectory, basePath: baseInput }) {
  const output = resolve(outputDirectory);
  const basePath = documentationBasePath(baseInput);
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filename;
      if (pathname.startsWith(basePath) && !pathname.includes('\\') && !pathname.includes('\0')) {
        const path = pathname.slice(basePath.length);
        const candidate = resolve(output, path.endsWith('/') || path === '' ? path + 'index.html' : path);
        const local = relative(output, candidate);
        if (local !== '..' && !local.startsWith(`..${sep}`)) {
          try {
            if ((await lstat(candidate)).isFile()) filename = candidate;
          } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
          }
        }
      }
      response.writeHead(filename ? 200 : 404, {
        'content-type': MIME.get(extname(filename ?? '404.html')) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filename ?? join(output, '404.html')).on('error', error => response.destroy(error)).pipe(response);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Documentation server error: ${error.message}\n`);
    }
  });
}
