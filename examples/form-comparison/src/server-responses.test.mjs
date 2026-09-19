import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { freePort, publicServerDefinition, startProcess } from './local-servers.mjs';
import { killProcessTree } from './step-runner.mjs';

// The responses of the public server (docs/spec/form-comparison.md, "Responses"): every response
// carries `X-Content-Type-Options: nosniff`, JSON error bodies escape `<`, `>` and `&`, and a 405
// answers with `Allow` naming the methods the target accepts.
const query = 'lang=en&server=js&framework=html&initialization=ssr&mode=bindForm&page=2';

test('every response carries nosniff, 405 answers Allow and error JSON escapes HTML', async () => {
  const port = await freePort();
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'crudui-server-responses-'));
  // The public directory needs the record files the build otherwise publishes.
  const publicDirectory = path.join(dataDirectory, 'public');
  await mkdir(publicDirectory, { recursive: true });
  await cp(path.join(import.meta.dirname, '..', 'public'), publicDirectory, { recursive: true });
  await copyFile(path.join(import.meta.dirname, '../fixtures/customer-specs.json'),
    path.join(publicDirectory, 'customer-specs.json'));
  await copyFile(path.join(import.meta.dirname, '../fixtures/customer-records.json'),
    path.join(publicDirectory, 'customer-records.json'));
  const definition = publicServerDefinition({
    port, dataDirectory, publicDirectory,
    ports: { php: port, 'php-ext': port, go: port, rust: port },
  });
  let running;
  try {
    running = await startProcess(definition, {
      ipc: true, message: { status: 'ready', cycle: 1, source: 'test', error: null },
    });
    const origin = running.origin;

    const cases = [
      ['page', `/?${query}`],
      ['static', '/comparison.css'],
      ['json', `/api/records?page=1`],
    ];
    for (const [what, target] of cases) {
      const response = await fetch(`${origin}${target}`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${what} nosniff`);
    }

    // A page answers 405 for every method except GET and names GET in Allow.
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await fetch(`${origin}/?${query}`, { method });
      assert.equal(response.status, 405, `${method} on the list page`);
      assert.equal(response.headers.get('allow'), 'GET', `${method} Allow`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${method} nosniff`);
    }

    // Static files answer HEAD like GET without a body and name both methods in Allow.
    const head = await fetch(`${origin}/comparison.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const wrong = await fetch(`${origin}/comparison.css`, { method: 'POST' });
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'GET, HEAD');

    // An error response never carries the raw request text: `<` of a hostile id is escaped.
    const hostile = await fetch(
      `${origin}/detail?id=%3Cscript%3Ealert(1)%3C%2Fscript%3E&${query}`);
    assert.equal(hostile.status, 400);
    const body = await hostile.text();
    assert.doesNotMatch(body, /<script>/, 'no raw script markup');
    assert.match(body, /\\u003c/, 'the hostile input is escaped');
    assert.equal(hostile.headers.get('x-content-type-options'), 'nosniff');

    // The document names the whole selection it was rendered for, including defaults.
    for (const [target, member, value] of [['/', 'lang', 'ko'], ['/', 'server', 'js'],
      [`/?${query}`, 'server', 'js'], [`/?${query}`, 'lang', 'en']]) {
      const page = await fetch(`${origin}${target}`);
      const html = await page.text();
      const dataset = /<html[^>]*data-pipeline-selection="([^"]*)"/.exec(html)?.[1];
      assert.ok(dataset, `the document of ${target} carries the selection dataset`);
      const selection = JSON.parse(dataset.replaceAll('&quot;', '"'));
      assert.equal(selection[member], value, `the selection dataset of ${target} names ${member}`);
    }
  } finally {
    if (running) await killProcessTree(running.child, 2000);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
