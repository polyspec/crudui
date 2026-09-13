import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeJson, encodeJson } from './json.mjs';
import { serverGeneration } from './server-generation.mjs';

const template = { kind: 'crudui/form-template', keyPrefix: 'form', fields: [] };
const spec = { type: 'group', properties: { name: { type: 'text' } } };
const reply = (value, status = 200) => new Response(encodeJson(value), { status, headers: { 'Content-Type': 'application/json' } });

test('caches server templates by specification and compile options', async () => {
  const calls = [];
  const generation = serverGeneration('go', 'bindForm', 'vue', async (url, init) => {
    calls.push({ url, init, payload: decodeJson(new TextEncoder().encode(init.body)) });
    return reply({ template, generator: { runtime: 'go' }, referenceReads: 7 });
  });
  const [first, concurrent] = await Promise.all([
    generation.prepare(spec, { keyPrefix: 'form' }),
    generation.prepare(structuredClone(spec), { keyPrefix: 'form' }),
  ]);
  assert.equal(first, concurrent);
  assert.equal(first.referenceReads, 7, 'The browser retains the server measurement');
  assert.equal(generation.compileRequests(), 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/go/compile/bindForm/vue');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].payload, {
    spec: { type: 'group', properties: { $ref: '/__crudui_browser_form__.json' } },
    options: { keyPrefix: 'form', files: { '/__crudui_browser_form__.json': spec } },
  });

  await generation.prepare(spec, { keyPrefix: 'other' });
  await generation.prepare({ ...spec, properties: {} }, { keyPrefix: 'form' });
  assert.equal(generation.compileRequests(), 3);

  // Root declarations stay on the form root; only the fields are referenced.
  const buttons = [{ type: 'submit', name: '_form_complete', value: '1' }];
  await generation.prepare({ ...spec, buttons }, { keyPrefix: 'form' });
  assert.deepEqual(calls.at(-1).payload, {
    spec: { type: 'group', buttons, properties: { $ref: '/__crudui_browser_form__.json' } },
    options: { keyPrefix: 'form', files: { '/__crudui_browser_form__.json': spec } },
  });
});

test('uses a cached template after compilation becomes unavailable', async () => {
  let available = true;
  const generation = serverGeneration('rust', 'createForm', 'svelte', async () => {
    if (!available) throw new Error('compile route blocked');
    return reply({ template, generator: { runtime: 'rust' }, referenceReads: 1 });
  });
  const first = await generation.prepare(spec, { keyPrefix: 'form' });
  available = false;
  assert.equal(await generation.prepare(structuredClone(spec), { keyPrefix: 'form' }), first);
  assert.equal(generation.compileRequests(), 1);
});

test('keeps a cumulative request baseline unchanged for a repeated cache key', async () => {
  const generation = serverGeneration('go', 'bindForm', 'react', async () =>
    reply({ template, generator: { runtime: 'go' }, referenceReads: 1 }));
  await generation.prepare({ ...spec, properties: {} }, { keyPrefix: 'form' });
  await generation.prepare(spec, { keyPrefix: 'form' });
  const baseline = generation.compileRequests();
  assert.equal(baseline, 2, 'A prior specification contributes to the cumulative count');
  await generation.prepare(structuredClone(spec), { keyPrefix: 'form' });
  assert.equal(generation.compileRequests(), baseline, 'Repeating the current cache key does not change the baseline');
});

test('resolves the default fetch at request time so route blocking is effective', async () => {
  const original = globalThis.fetch;
  const generation = serverGeneration('go', 'createForm', 'react');
  globalThis.fetch = async () => reply({ template, generator: { runtime: 'go' }, referenceReads: 1 });
  const cached = await generation.prepare(spec);
  globalThis.fetch = async () => { throw new Error('compile route blocked'); };
  try {
    assert.equal(await generation.prepare(structuredClone(spec)), cached);
    await assert.rejects(generation.prepare({ ...spec, properties: {} }), /compile route blocked/);
  } finally { globalThis.fetch = original; }
  assert.equal(generation.compileRequests(), 2);
});

test('does not replace compilation failures with a local template', async () => {
  let attempts = 0;
  const generation = serverGeneration('php', 'bindForm', 'react', async () => {
    attempts++;
    return reply({ error: 'missing composition file' }, 400);
  });
  await assert.rejects(generation.prepare(spec, { keyPrefix: 'form' }), /missing composition file/);
  await assert.rejects(generation.prepare(spec, { keyPrefix: 'form' }), /missing composition file/);
  assert.equal(attempts, 2, 'A failed request is removed so an explicit retry reaches the server');
  assert.equal(generation.compileRequests(), 2);
});

test('requires the selected server reference-read representation', async () => {
  const php = serverGeneration('php-ext', 'createForm', 'react', async () => reply({ template, generator: {}, referenceReads: 0 }));
  await assert.rejects(php.prepare(spec), /must report unavailable/);
  const go = serverGeneration('go', 'bindForm', 'react', async () => reply({ template, generator: {}, referenceReads: null }));
  await assert.rejects(go.prepare(spec), /missing measured/);
});

test('does not count an invalid payload as an HTTP compile request', async () => {
  const generation = serverGeneration('go', 'bindForm', 'react', async () => { throw new Error('must not send'); });
  await assert.rejects(
    generation.prepare(spec, { files: { '/__crudui_browser_form__.json': {} } }),
    /cannot replace/
  );
  assert.equal(generation.compileRequests(), 0);
});
