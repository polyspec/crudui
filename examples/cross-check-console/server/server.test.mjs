/**
 * Gateway HTTP boundary — error contract + CORS + spec coercion.
 *
 * The node-api server contract the gateway follows:
 *   - a CLIENT INPUT fault (bad JSON body, missing spec, malformed YAML) is a
 *     4xx { error } — NOT a result surface;
 *   - a VALIDATION failure (the data is invalid) is a 200 result envelope, never
 *     an HTTP error (the CRUDUI LOAD-vs-validate distinction lives inside the 200);
 *   - CORS headers are set on every response;
 *   - /health is a liveness 200.
 *
 * The server module is imported for its exported `handler` (no listen side
 * effect after the entry-point guard) and mounted on an ephemeral port. The
 * render path is NOT exercised here (it would boot the Vite SSR engine — that is
 * render-runner.test.mjs's job); the validate path spawns the four CLIs, which
 * proves the "validation failure == 200" rule on real engine output.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { coerceSpec, handler } from './server.mjs';

let server;
let base;

beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** POST raw bytes (so a deliberately malformed JSON body can be sent). */
function postRaw(pathname, rawBody) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

describe('coerceSpec — unit (YAML string vs object)', () => {
  test('YAML string parses to an object', () => {
    expect(coerceSpec('type: group\nproperties: {}')).toEqual({
      type: 'group',
      properties: {},
    });
  });

  test('a plain object passes through unchanged', () => {
    const obj = { type: 'group', properties: {} };
    expect(coerceSpec(obj)).toBe(obj);
  });

  test('malformed YAML throws (→ 400 at the boundary)', () => {
    expect(() => coerceSpec('[a, b')).toThrow(/YAML parse error/);
  });

  test('YAML that parses to a non-object (a scalar) throws', () => {
    expect(() => coerceSpec('42')).toThrow(/must parse to an object/);
  });

  test('missing spec (null/undefined) throws', () => {
    expect(() => coerceSpec(undefined)).toThrow(/Missing field: spec/);
  });
});

describe('HTTP boundary — client input faults are 4xx { error }', () => {
  test('bad JSON request body → 400 { error }', async () => {
    const res = await postRaw('/api/validate', '{ this is not json');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('missing spec field → 400 { error }', async () => {
    const res = await postRaw('/api/validate', JSON.stringify({ data: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/spec/i);
  });

  test('malformed YAML spec string → 400 { error }', async () => {
    const res = await postRaw('/api/validate', JSON.stringify({ spec: '[a, b' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/YAML/i);
  });

  test('render endpoint shares the same 400 contract (no engine boot for input faults)', async () => {
    const res = await postRaw('/api/render', JSON.stringify({ spec: '[a, b' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/YAML/i);
  });

  test('validate-list endpoint shares the same 400 contract (malformed YAML list-spec)', async () => {
    const res = await postRaw('/api/validate-list', JSON.stringify({ listSpec: '[a, b' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/YAML/i);
  });

  test('validate-list missing spec → 400 { error }', async () => {
    const res = await postRaw('/api/validate-list', JSON.stringify({ files: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/spec/i);
  });
});

describe('HTTP boundary — CORS + /health', () => {
  test('every response carries CORS (Access-Control-Allow-Origin: *)', async () => {
    const res = await postRaw('/api/validate', '{bad');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('OPTIONS preflight → 204 with CORS', async () => {
    const res = await fetch(base + '/api/validate', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });

  test('GET /health → 200 { status: ok }', async () => {
    const res = await fetch(base + '/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });
});

describe('HTTP boundary — validation FAILURE is a 200 result surface, not an HTTP error', () => {
  // Real 4-language fan-out (spawns the CRUDUI CLIs). A spec whose data is invalid
  // must still return HTTP 200 with { results, idempotent } — the failure lives
  // INSIDE the envelope, never as a 4xx/5xx. Requires the Go/Rust binaries.
  test('invalid data → 200, valid:false in the envelope, idempotent:true', async () => {
    const spec = {
      type: 'group',
      properties: { email: { type: 'email', validate: { required: true } } },
    };
    const res = await postRaw('/api/validate', JSON.stringify({ spec, data: { email: '' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const failed = body.results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);
    expect(body.idempotent, JSON.stringify(body.mismatch)).toBe(true);
    expect(body.results.every((r) => r.valid === false)).toBe(true);
  }, 60000);

  // The validate sister of /api/validate (SPEC §9). A list-spec carrying a §6
  // forbidden meta key is a load failure, NOT an HTTP error: still 200, with the
  // SAME failure record on all four engines (idempotent). Requires Go/Rust.
  test('list-spec with a forbidden meta key → 200, failure code on all four, idempotent:true', async () => {
    const listSpec = {
      columns: { name: { field: '.name' }, display_switch: { field: '.x' } },
    };
    const res = await postRaw('/api/validate-list', JSON.stringify({ listSpec }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const failed = body.results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);
    expect(body.idempotent, JSON.stringify(body.mismatch)).toBe(true);
    expect(body.results.every((r) => r.failure && r.failure.code === 'FORBIDDEN_META_KEY')).toBe(true);
    expect(body.results.every((r) => r.valid === false)).toBe(true);
  }, 60000);

  // A clean list-spec → 200, valid:true on all four (idempotent). `data` on the
  // request is ignored — a list has no rows (mode:list runs no DATA pass).
  test('clean list-spec → 200, valid:true on all four, idempotent:true', async () => {
    const listSpec = { columns: { name: { field: '.name', label: 'Name' } } };
    const res = await postRaw('/api/validate-list', JSON.stringify({ listSpec, data: { ignored: true } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const failed = body.results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.lang}:${r.error}`)).toEqual([]);
    expect(body.idempotent, JSON.stringify(body.mismatch)).toBe(true);
    expect(body.results.every((r) => r.valid === true)).toBe(true);
  }, 60000);
});
