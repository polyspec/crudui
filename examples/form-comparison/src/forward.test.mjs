import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
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


async function closeServers(...servers) {
  for (const server of servers) server.closeAllConnections?.();
  await Promise.all(servers.map(server => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
}

function send(port, { path = '/public', method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString(),
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

test('forwarding preserves the target path, host, method and body and removes connection headers in both directions',
  { timeout: 10_000 }, async () => {
    let received;
    const upstream = await listen((request, response) => {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.once('end', () => {
        received = { path: request.url, method: request.method, headers: request.headers,
          body: Buffer.concat(chunks).toString() };
        response.writeHead(201, {
          connection: 'keep-alive, x-response-hop', 'x-response-hop': 'private',
          'keep-alive': 'timeout=123', 'x-end-to-end': 'retained',
        });
        response.end('saved');
      });
    });
    const target = { port: upstream.address().port, path: '/save?record=7', server: 'test' };
    const front = await listen((request, response) => forward(target, request, response));
    try {
      const answer = await send(front.address().port, { path: '/public?ignored=1', method: 'POST',
        headers: { connection: 'keep-alive, x-request-hop', 'x-request-hop': 'private',
          'keep-alive': 'timeout=321', 'x-end-to-end': 'retained', 'content-length': '4' }, body: 'data' });
      assert.equal(answer.status, 201);
      assert.equal(answer.body, 'saved');
      assert.equal(answer.headers['x-response-hop'], undefined);
      assert.notEqual(answer.headers['keep-alive'], 'timeout=123');
      assert.equal(answer.headers['x-end-to-end'], 'retained');
      assert.equal(received.path, '/save?record=7');
      assert.equal(received.method, 'POST');
      assert.equal(received.body, 'data');
      assert.equal(received.headers.host, `127.0.0.1:${target.port}`);
      assert.equal(received.headers['x-request-hop'], undefined);
      assert.notEqual(received.headers['keep-alive'], 'timeout=321');
      assert.equal(received.headers['x-end-to-end'], 'retained');
    } finally {
      await closeServers(front, upstream);
    }
  });

test('an unavailable upstream returns a structured 502 response', { timeout: 10_000 }, async () => {
  const upstream = await listen((_request, response) => response.end());
  const target = { port: upstream.address().port, path: '/save', server: 'unavailable' };
  await closeServers(upstream);
  const front = await listen((request, response) => forward(target, request, response));
  try {
    const answer = await send(front.address().port);
    assert.equal(answer.status, 502);
    assert.equal(answer.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(answer.headers['cache-control'], 'no-store');
    const failure = JSON.parse(answer.body);
    assert.equal(failure.server, 'unavailable');
    assert.equal(typeof failure.error, 'string');
    assert.ok(failure.error.length > 0);
  } finally {
    await closeServers(front);
  }
});

test('an aborted client upload aborts the upstream request', { timeout: 10_000 }, async () => {
  let acceptRequest;
  const started = new Promise(resolve => { acceptRequest = resolve; });
  const upstream = await listen((request, _response) => {
    request.once('data', () => acceptRequest(request));
  });
  const target = { port: upstream.address().port, path: '/save', server: 'aborted' };
  const front = await listen((request, response) => forward(target, request, response));
  const client = http.request({ hostname: '127.0.0.1', port: front.address().port, method: 'POST',
    headers: { 'content-length': '1024' } });
  client.on('error', () => {});
  try {
    client.write('partial');
    const incoming = await started;
    const aborted = once(incoming, 'aborted');
    client.destroy();
    await aborted;
    assert.equal(incoming.aborted, true);
  } finally {
    client.destroy();
    await closeServers(front, upstream);
  }
});
