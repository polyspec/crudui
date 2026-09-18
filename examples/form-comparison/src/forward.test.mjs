import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';

import { forward } from './forward.mjs';

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// A server that answers from the headers of an oversized body with a 413 and Connection: close,
// then reads and discards the rest of the body before it closes, as nginx does with a body over
// client_max_body_size and lingering_close.
const early = () => new Promise(resolve => {
  const server = net.createServer(socket => {
    let head = '';
    let remaining = null;
    socket.on('data', chunk => {
      if (remaining === null) {
        head += chunk.toString('latin1');
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) return;
        const length = Number(/\r\ncontent-length: *(\d+)/i.exec(head)?.[1] ?? 0);
        remaining = length - (head.length - end - 4);
        const body = '{"error":"too large"}';
        socket.write(`HTTP/1.1 413 Payload Too Large\r\nContent-Type: application/json\r\n`
          + `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
      } else remaining -= chunk.length;
      if (remaining <= 0) socket.end();
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

test('an early answer reaches the client however the upload continues', { timeout: 60_000 }, async () => {
  const upstream = await early();
  const target = { port: upstream.address().port, path: '/save', server: 'early' };
  const front = await listen((request, response) => forward(target, request, response));
  const body = 'x'.repeat(2 * 1024 * 1024);
  const outcomes = {};
  try {
    for (let i = 0; i < 40; i++) {
      let outcome;
      try {
        const answer = await fetch(`http://127.0.0.1:${front.address().port}/save`, { method: 'POST', body });
        await answer.text();
        outcome = String(answer.status);
      } catch (error) {
        outcome = `${error.message}: ${error.cause?.code ?? error.cause?.message}`;
      }
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
  } finally {
    front.closeAllConnections();
    await Promise.all([front, upstream].map(server => new Promise(resolve => server.close(resolve))));
  }
  assert.deepEqual(outcomes, { 413: 40 });
});
