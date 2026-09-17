// The JavaScript record server on its own address, as the record-store checks start it:
//   node main.mjs {address} {data directory} {public directory} {source identity file}
// The public server answers `/api/js/records…` with the same module.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

import { recordStore } from './records.mjs';

const [address, dataDirectory, publicDirectory, sourceFile] = process.argv.slice(2);
const separator = address?.lastIndexOf(':') ?? -1;
if (process.argv.length !== 6 || separator < 1) {
  throw new Error('Usage: node main.mjs {host:port} {data directory} {public directory} {source identity file}');
}
const store = recordStore({ server: 'js', dataDirectory, publicDirectory });

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/api/health') {
    const source = JSON.parse(await readFile(sourceFile, 'utf8'));
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: 'ok', server: 'js', source }));
    return;
  }
  await store.handle(request, response, url.pathname, url.search);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
server.listen(Number(address.slice(separator + 1)), address.slice(0, separator),
  () => process.stderr.write('CRUDUI_READY js\n'));
