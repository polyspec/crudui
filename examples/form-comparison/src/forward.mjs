import http from 'node:http';

import { encodeJson } from './json.mjs';

// Headers that describe one connection (RFC 9110, section 7.6.1), not the message.
const hopByHop = new Set(['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function endToEnd(headers) {
  const named = new Set((headers.connection ?? '').split(',').map(name => name.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !hopByHop.has(name) && !named.has(name)));
}

/** Forward a request to the server on 127.0.0.1 at `target.port` and `target.path`. */
export function forward(target, request, response) {
  // A server may answer before it has read the whole body, as an oversized request's 413. Once it
  // has answered, its answer is the response: the rest of the upload is read and discarded, so the
  // client finishes sending and reads the answer, and a failed write of that rest to the server
  // does not cut the answer. The hop-by-hop headers of the server's connection stay with it; the
  // client's connection closes by its own rules once the body is read.
  let answered = false;
  const outgoing = http.request({
    hostname: '127.0.0.1', port: target.port, path: target.path, method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${target.port}` },
  }, incoming => {
    answered = true;
    request.unpipe(outgoing);
    request.resume();
    response.writeHead(incoming.statusCode, endToEnd(incoming.headers));
    incoming.pipe(response);
    incoming.on('error', error => response.destroy(error));
  });
  outgoing.on('error', error => {
    if (answered) return;
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(encodeJson({ error: error.message, server: target.server }));
    } else response.destroy(error);
  });
  request.on('aborted', () => outgoing.destroy());
  request.pipe(outgoing);
}
