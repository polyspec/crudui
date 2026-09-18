import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { encodeJson, decodeJson, readJson } from './src/json.mjs';
import { formRenderingPaths, formServers } from './src/runtime-paths.mjs';
import { finalizePersistenceReport } from './persistence-report.mjs';
import { assertSourceIdentity } from './src/source-identity.mjs';

// Run inside the comparison container while browser checks are stopped.
const base = 'http://127.0.0.1:8080';
const servers = formServers;
const renderingPaths = formRenderingPaths;
const results = [];
let equivalentRoundtrip;
const key = seq => `__${String(seq).padStart(13, '0')}__`;
const temporaryKey = '__abcdef0123456__';
const parsed = bytes => decodeJson(new Uint8Array(bytes));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(name => [name, canonical(value[name])])) : value;
const sourceResponse = await fetch(`${base}/source.json`);
assert.equal(sourceResponse.status, 200, 'source identity response');
const source = assertSourceIdentity(await sourceResponse.json());

function native(data, format) {
  const fields = format === 'multipart' ? new FormData() : new URLSearchParams();
  function append(value, name) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) append(child, `${name}[${key}]`);
    } else fields.append(name, value == null ? '' : String(value));
  }
  append(data, 'form');
  fields.append('_form_complete', '1');
  return fields;
}

for (const server of servers) {
  for (const renderingPath of renderingPaths) {
    const file = `/data/${server}-${renderingPath}-react.json`;
    let previous;
    try { previous = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const url = action =>
      `${base}/api/${server}/${action}/${renderingPath}/react`;
    async function request(action, body, headers) {
      const response = await fetch(url(action), { method: action === 'load' ? 'GET' : 'POST', body, headers });
      const data = await readJson(response);
      assert.equal(data.server, server, 'response must identify the selected server');
      if (server.startsWith('php')) assert.equal(data.nativeJson, server === 'php-ext', 'PHP processor mode');
      return { status: response.status, ...data };
    }
    async function reset() {
      const result = await request('reset', new URLSearchParams({ fixture: 'nonsequential' }));
      assert.equal(result.status, 200, result.error);
      return result;
    }
    const save = (data, format) => format === 'json'
      ? request('save', encodeJson({ form: data }), { 'Content-Type': 'application/json' })
      : request('save', native(data, format));
    async function check(id, action) {
      let error;
      try { await action(); } catch (failure) { error = failure.stack; }
      results.push({ server, path: renderingPath, id, passed: !error,
        ...(error ? { error } : {}) });
      process.stdout.write(`${server}/${renderingPath}/${id}: ${error ? `FAIL ${error}` : 'PASS'}\n`);
    }
    try {
      for (const format of ['multipart', 'urlencoded', 'json']) {
        await check(`${format}/roundtrip`, async () => {
          const before = await reset();
          const saved = await save(before.data, format);
          assert.equal(saved.status, 200, saved.error);
          assert.equal(saved.validatorSource, 'current');
          assert.equal(saved.validation.valid, true);
          assert.deepEqual(saved.storage, before.storage);
          assert.equal(encodeJson(saved.data), encodeJson(before.data), 'loaded field and row order');
          assert.deepEqual(parsed(await readFile(file)), saved.storage, 'actual persisted records');
          assert.deepEqual(saved.storage.companies.map(row => row.company_seq), ['5', '7', '1']);
          const loaded = await request('load');
          assert.equal(encodeJson(loaded.data), encodeJson(saved.data));
          const signature = { storage: canonical(saved.storage), data: encodeJson(saved.data), keyChanges: saved.keyChanges };
          if (equivalentRoundtrip) {
            assert.deepEqual(signature, equivalentRoundtrip,
              'same result across servers, rendering paths and transports');
          } else equivalentRoundtrip = signature;
        });
        await check(`${format}/create-delete-create`, async () => {
          const before = await reset();
          const empty = {};
          const department = { name: '신규 부서 / New department' };
          const store = { name: 'New store', enabled: '', detail: 'A & B\n한글',
            title: { ko: '제목', en: 'Title' },
            departments: { [temporaryKey]: department } };
          const company = { name: 'New company', stores: { [temporaryKey]: store } };
          const entries = Object.entries(before.data.companies);
          entries.splice(1, 0, [temporaryKey, company]);
          before.data.companies = Object.fromEntries(entries);
          const saved = await save(before.data, format);
          assert.equal(saved.status, 200, saved.error);
          assert.deepEqual(saved.storage.companies.map(row => row.company_seq), ['5', '8', '7', '1']);
          const storeSeq = String(before.storage.next.store);
          const departmentSeq = String(before.storage.next.department);
          assert.equal(saved.storage.stores.find(row => row.store_seq === storeSeq).company_seq, '8');
          assert.equal(saved.storage.departments.find(row => row.department_seq === departmentSeq).store_seq, storeSeq);
          assert.deepEqual(saved.keyChanges, [
            { path: `companies.${temporaryKey}.stores.${temporaryKey}.departments`, oldKey: temporaryKey, newKey: key(departmentSeq) },
            { path: `companies.${temporaryKey}.stores`, oldKey: temporaryKey, newKey: key(storeSeq) },
            { path: 'companies', oldKey: temporaryKey, newKey: key(8) },
          ]);
          const deleted = await save({ companies: empty }, format);
          assert.equal(deleted.status, 200, deleted.error);
          assert.deepEqual(deleted.storage.next, saved.storage.next);
          for (const table of ['companies', 'stores', 'departments']) assert.deepEqual(deleted.storage[table], []);
          assert.deepEqual(deleted.data.companies, empty);
          const inserted = await save({ companies: { [temporaryKey]: company } }, format);
          assert.equal(inserted.status, 200, inserted.error);
          assert.equal(inserted.storage.companies[0].company_seq, '9', 'deleted IDs are not reused');
        });
        await check(`${format}/invalid-preserves-file`, async () => {
          const before = await reset();
          const bytes = await readFile(file);
          Object.values(before.data.companies)[0].name = '';
          const result = await save(before.data, format);
          assert.equal(result.status, 422);
          assert.equal(result.validation.valid, false);
          assert.deepEqual(await readFile(file), bytes);
        });
      }
      await check('physical-record-order', async () => {
        const before = await reset();
        const reversed = structuredClone(before.storage);
        for (const table of ['companies', 'stores', 'departments']) reversed[table].reverse();
        await writeFile(file, encodeJson(reversed) + '\n');
        const loaded = await request('load');
        assert.equal(loaded.status, 200, loaded.error);
        assert.equal(encodeJson(loaded.data), encodeJson(before.data), 'positions determine loaded order');
      });
      await check('invalid-storage-preserved', async () => {
        await reset();
        const bytes = await readFile(file);
        try {
          await writeFile(file, '{invalid');
          const response = await request('load');
          assert.ok(response.status >= 400);
          assert.equal(await readFile(file, 'utf8'), '{invalid', 'invalid records must not become seed data');
        } finally { await writeFile(file, bytes); }
      });
      await check('unknown-fixture', async () => {
        await reset();
        const bytes = await readFile(file);
        for (const fields of [{ fixture: 'unknown' }, { 'fixture[invalid]': 'value' }]) {
          const result = await request('reset', new URLSearchParams(fields));
          assert.equal(result.status, 400);
          assert.deepEqual(await readFile(file), bytes);
        }
        for (const type of ['application/json', 'text/plain']) {
          assert.equal((await request('reset', '{}', { 'Content-Type': type })).status, 415);
          assert.deepEqual(await readFile(file), bytes);
        }
      });
      await check('scalar-field-types', async () => {
        const before = await reset();
        const bytes = await readFile(file);
        for (const value of [1, 1.25, true, false, [], {}]) {
          Object.values(before.data.companies)[0].name = value;
          assert.equal((await save(before.data, 'json')).status, 400);
        }
        Object.values(before.data.companies)[0].name = null;
        assert.equal((await save(before.data, 'json')).status, 400, 'a null leaf is not text and fails the companies shape');
        assert.deepEqual(await readFile(file), bytes);
      });
      await check('language-collection-type', async () => {
        const before = await reset();
        const bytes = await readFile(file);
        for (const title of [['invalid'], { fr: 'invalid' }, { '5': 'invalid' }]) {
          Object.values(Object.values(before.data.companies)[0].stores)[0].title = title;
          for (const format of ['multipart', 'urlencoded', 'json']) assert.equal((await save(before.data, format)).status, 400);
        }
        assert.deepEqual(await readFile(file), bytes);
      });
      await check('request-size-limit', async () => {
        const before = await reset();
        const bytes = await readFile(file);
        Object.values(before.data.companies)[0].name = 'x'.repeat(2 * 1024 * 1024);
        for (const format of ['multipart', 'urlencoded', 'json']) assert.equal((await save(before.data, format)).status, 413);
        assert.deepEqual(await readFile(file), bytes);
      });
    } finally {
      if (previous) await writeFile(file, previous);
      else await rm(file, { force: true });
    }
  }
}
const output = '/results/server-report.json';
// Keep the report outside individual repositories and retain the previous report.
try {
  const previous = JSON.parse(await readFile(output, 'utf8'));
  await copyFile(output, `/results/server-report-${previous.generatedAt.replaceAll(':', '-')}.json`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const report = finalizePersistenceReport(results, source);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
if (!report.passed) {
  process.exitCode = 1;
}
