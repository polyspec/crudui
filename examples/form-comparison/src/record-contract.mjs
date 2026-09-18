// The record resource of the canonical page: one customer record specification, one shared
// fixture and one HTTP contract that every record store implements (docs/spec/form-comparison.md,
// "Record resource"). The JavaScript, PHP, PHP extension, Go and Rust servers are checked by the
// same cases below; a case that passes for one server and fails for another is a defect.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';

import { compileForm, createForm } from '@crudui/generator-core';
import { renderDetail, renderForm, renderList } from '@crudui/generator-html';
import { JSDOM } from 'jsdom';
import { validate } from '@crudui/validator';

import customerRecords from '../fixtures/customer-records.json' with { type: 'json' };
import customerSpecs from '../fixtures/customer-specs.json' with { type: 'json' };
import {
  formData, linkedSpecs, recordClients, recordInitializations, recordModes, recordServers, recordsPerPage,
  recordViews, selectionQuery,
} from './record-view.mjs';

export {
  formData, recordClients, recordInitializations, recordModes, recordServers, recordsPerPage, recordViews,
  selectionQuery,
};
/** Files every record server reads from its public directory. */
export const recordFixtureFile = 'customer-records.json';
export const recordSpecsFile = 'customer-specs.json';
/** The editable members of one record; `id` is read-only and `avatar` is not part of the form. */
export const editableRecordFields = Object.freeze(['name', 'status', 'joined', 'score', 'relation', 'markup']);

/** An independent copy of the 45 seeded records. */
export function recordFixture() {
  return structuredClone(customerRecords);
}

/** An independent copy of the list, detail and form specifications of the record. */
export function recordSpecs() {
  return structuredClone(customerSpecs);
}

/** The store file of one server inside its data directory. */
export function recordStoreName(server) {
  assert.ok(recordServers.includes(server), `Unknown record server: ${server}`);
  return `records-${server}.json`;
}

/** The address of one page of the canonical flow. */
export function pageAddress(view, selection, { id, saved } = {}) {
  const query = selectionQuery(selection);
  if (view === 'list') return `/?${query}${saved === undefined ? '' : `&saved=${encodeURIComponent(saved)}`}`;
  return `/${view}?id=${encodeURIComponent(id)}&${query}`;
}

/** The list and detail specifications with the selection query appended to their links. */
export function stageSpecs(selection) {
  return linkedSpecs(customerSpecs, selection);
}

/** The records of one list page, in id order. */
export function pageRecords(records, page) {
  return records.slice((page - 1) * recordsPerPage, page * recordsPerPage);
}

/** The stage HTML the selected server writes for one SSR view; every server writes these bytes. */
export function expectedStageHtml(view, selection, { records, record }) {
  const specs = stageSpecs(selection);
  const language = selection.lang;
  if (view === 'list') {
    return renderList(specs.list, pageRecords(records, selection.page),
      { language, layout: 'table', page: selection.page, total: records.length });
  }
  if (view === 'detail') return renderDetail(specs.detail, record, { language });
  const template = compileForm(specs.form, { keyPrefix: 'form' });
  const form = renderForm(createForm(template, formData(record), { language }));
  return `<form id="record-form" method="post" action="/api/${selection.server}/records/${record.id}" `
    + `enctype="multipart/form-data">${form}</form>`;
}

/** The record a valid save stores: the previous record with the submitted editable members. */
export function savedRecord(previous, data) {
  return {
    id: previous.id, name: data.name, status: data.status, joined: data.joined,
    score: Number(data.score), relation: { name: data.relation.name },
    avatar: previous.avatar, markup: data.markup, companies: structuredClone(data.companies),
  };
}

/** The validation result of one submission, as the reference validator reports it. */
export function expectedValidation(data) {
  return validate(recordSpecs().form, data);
}

/**
 * Native fields of one submission, as the rendered form posts them: an unchecked `enabled`
 * checkbox and a collection without rows post nothing.
 */
export function nativeFields(data, format, { complete = true } = {}) {
  const fields = format === 'multipart' ? new FormData() : new URLSearchParams();
  const append = (value, name) => {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) append(child, `${name}[${key}]`);
    } else if (!(name.endsWith('[enabled]') && value === '')) fields.append(name, value);
  };
  append(data, 'form');
  if (complete) fields.append('_form_complete', '1');
  return fields;
}

/**
 * The multipart fields a browser submits from rendered form content: the form's successful
 * controls in tree order, as FormData collects them, and the completion field of its submit button.
 */
export function browserFields(html) {
  const { window } = new JSDOM(`<form>${html}</form>`);
  const fields = new FormData();
  for (const [name, value] of new window.FormData(window.document.querySelector('form'))) {
    fields.append(name, typeof value === 'string' ? value : '');
  }
  fields.append('_form_complete', '1');
  return fields;
}

/** Encode one submission in the given transport. */
export function submission(data, format) {
  return format === 'json'
    ? { body: JSON.stringify({ form: data }), headers: { 'Content-Type': 'application/json' } }
    : { body: nativeFields(data, format), headers: {} };
}

/**
 * A client of one running record server. `origin` returns the server's current origin, which a
 * restart may change; its paths are the internal `/api/records...` paths (the public server
 * forwards `/api/{server}/records...` to them).
 */
export function recordClient({ origin, server, storeFile, restart }) {
  async function request(method, target, { body, headers } = {}) {
    const response = await fetch(new URL(target, origin()), { method, body, headers, redirect: 'manual' });
    const text = await response.text();
    const type = response.headers.get('content-type') ?? '';
    let json;
    if (type.startsWith('application/json')) {
      json = JSON.parse(text);
      assert.equal(json.server, server, `${method} ${target}: the response names the responding server`);
    }
    return { status: response.status, type, text, json, cacheControl: response.headers.get('cache-control') };
  }
  /**
   * Send the headers of a request that declares `declaredBytes` and only `sentBytes` of its body,
   * and never send the rest: the answer can only come from a server that stops at its limit
   * instead of reading the whole body.
   */
  function unfinishedRequest(method, target, { headers, declaredBytes, sentBytes }) {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const outgoing = http.request(new URL(target, origin()), {
        method, headers: { ...headers, 'Content-Length': String(declaredBytes) },
      });
      outgoing.on('error', reject);
      outgoing.on('response', response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const elapsedMs = performance.now() - started;
          outgoing.destroy();
          const text = Buffer.concat(chunks).toString('utf8');
          const type = response.headers['content-type'] ?? '';
          const json = type.startsWith('application/json') ? JSON.parse(text) : undefined;
          resolve({ status: response.statusCode, type, text, json, elapsedMs });
        });
      });
      outgoing.write(Buffer.alloc(sentBytes, 'x'));
    });
  }
  return {
    server, request, unfinishedRequest, restart,
    storeBytes: () => readFile(storeFile),
    writeStore: bytes => writeFile(storeFile, bytes),
    storeRecords: async () => JSON.parse(await readFile(storeFile, 'utf8')),
    reset: async () => {
      const result = await request('POST', '/api/records/reset');
      assert.equal(result.status, 200, `reset: ${result.text}`);
      assert.deepEqual(result.json, { total: 45, server }, 'reset response');
      return result;
    },
    save: (id, data, format) => request('POST', `/api/records/${id}`, submission(data, format)),
  };
}

const edited = (id, suffix) => ({
  ...formData(customerRecords[Number(id) - 1]),
  name: `Edited ${suffix} & <b>`, status: 'blocked', joined: '2027-02-28', score: '9021.25',
  relation: { name: `Relation ${suffix} / 연관` }, markup: '<em>saved</em>',
});

async function unchanged(client, action, message) {
  const before = await client.storeBytes();
  await action();
  assert.deepEqual(await client.storeBytes(), before, message);
}

/**
 * The contract cases in execution order. Each case starts from a reset store unless it says
 * otherwise, and leaves the store file as its own assertions describe.
 */
export const recordContractCases = Object.freeze([
  {
    id: 'reset-seeds-the-fixture',
    async run(client) {
      await client.reset();
      assert.deepEqual(await client.storeRecords(), recordFixture(), 'the store holds the fixture in id order');
    },
  },
  {
    id: 'list-pages',
    async run(client) {
      await client.reset();
      for (const page of [1, 2, 3]) {
        const result = await client.request('GET', `/api/records?page=${page}`);
        assert.equal(result.status, 200, result.text);
        assert.equal(result.cacheControl, 'no-store');
        assert.deepEqual(Object.keys(result.json).sort(), ['page', 'perPage', 'records', 'server', 'total']);
        assert.equal(result.json.page, page);
        assert.equal(result.json.perPage, 20);
        assert.equal(result.json.total, 45);
        assert.deepEqual(result.json.records, pageRecords(recordFixture(), page), `page ${page}`);
      }
    },
  },
  {
    id: 'list-rejects-pages',
    async run(client) {
      await client.reset();
      for (const query of ['', '?page=', '?page=0', '?page=01', '?page=-1', '?page=1.0', '?page=x',
        '?page=1&page=1', '?page=1&per_page=20', '?page=1&sort=name']) {
        const result = await client.request('GET', `/api/records${query}`);
        assert.equal(result.status, 400, `query ${query}: ${result.text}`);
        assert.equal(result.json.error, 'Expected one page parameter', `query ${query}`);
      }
      const beyond = await client.request('GET', '/api/records?page=4');
      assert.equal(beyond.status, 404, beyond.text);
      assert.equal(beyond.json.error, 'Page not found');
      assert.equal((await client.request('POST', '/api/records?page=1')).status, 405);
    },
  },
  {
    id: 'record-by-id',
    async run(client) {
      await client.reset();
      const result = await client.request('GET', '/api/records/22');
      assert.equal(result.status, 200, result.text);
      assert.deepEqual(result.json, { record: recordFixture()[21], server: client.server });
      // The segment is compared as written: an encoded stored id is not a stored id.
      for (const id of ['46', '0', '022', '%32%32']) {
        const missing = await client.request('GET', `/api/records/${id}`);
        assert.equal(missing.status, 404, `id ${id}: ${missing.text}`);
        assert.equal(missing.json.error, 'Record not found', `id ${id}`);
      }
    },
  },
  ...['multipart', 'urlencoded', 'json'].map(format => ({
    id: `save-${format}`,
    async run(client) {
      await client.reset();
      const data = edited('22', format);
      const result = await client.save('22', data, format);
      assert.equal(result.status, 200, result.text);
      const expected = savedRecord(recordFixture()[21], data);
      assert.deepEqual(result.json, {
        record: expected, validation: { valid: true, errors: [] }, server: client.server,
      });
      const records = recordFixture();
      records[21] = expected;
      assert.deepEqual(await client.storeRecords(), records, 'only record 22 changed in the store');
      assert.deepEqual((await client.request('GET', '/api/records/22')).json.record, expected);
      assert.deepEqual((await client.request('GET', '/api/records?page=2')).json.records,
        pageRecords(records, 2), 'the list shows the saved values');
    },
  })),
  ...['multipart', 'urlencoded', 'json'].map(format => ({
    id: `save-companies-${format}`,
    async run(client) {
      await client.reset();
      // Record 24 has companies whose stores differ; the edit reorders, adds and removes rows,
      // hides a store's notes and empties a collection, as a person editing the form does.
      const data = edited('24', format);
      const [[firstKey, first], ...others] = Object.entries(data.companies);
      const [[storeKey, store]] = Object.entries(first.stores);
      store.enabled = '';
      store.detail = 'Kept while hidden after a save';
      store.departments = {};
      const added = { name: 'Added company', stores: { __0f1e2d3c4b5a6__: {
        name: 'Added store', enabled: '1', detail: '', title: { ko: '추가', en: 'Added' },
        departments: { __00000000000aa__: { name: 'Added department' } },
      } } };
      data.companies = Object.fromEntries([['__0a1b2c3d4e5f6__', added], ...others,
        [firstKey, { ...first, stores: { [storeKey]: store } }]]);
      const result = await client.save('24', data, format);
      assert.equal(result.status, 200, result.text);
      const expected = savedRecord(recordFixture()[23], data);
      assert.deepEqual(result.json, {
        record: expected, validation: { valid: true, errors: [] }, server: client.server,
      });
      const stored = (await client.storeRecords())[23];
      assert.deepEqual(stored, expected, 'the store keeps the rows, their keys and order and the hidden notes');
      assert.deepEqual(Object.keys(stored.companies), Object.keys(data.companies), 'row order');
      assert.deepEqual((await client.request('GET', '/api/records/24')).json.record, expected);
    },
  })),
  {
    id: 'save-completes-absent-members',
    async run(client) {
      await client.reset();
      // Form data leaves out a field that holds no value: a new row carries only its defaults.
      const data = edited('27', 'absent');
      delete data.markup;
      const company = Object.values(data.companies)[0];
      company.stores.__00000000000ab__ = { name: 'New store', enabled: '1',
        departments: { __00000000000ac__: { name: 'New department' } } };
      const complete = structuredClone(data);
      complete.markup = '';
      Object.assign(Object.values(complete.companies)[0].stores.__00000000000ab__,
        { detail: '', title: { ko: '', en: '' } });
      complete.companies = Object.fromEntries(Object.entries(complete.companies).map(([key, row]) =>
        [key, { ...row, stores: Object.fromEntries(Object.entries(row.stores).map(([storeKey, store]) =>
          [storeKey, { name: store.name, enabled: store.enabled, detail: store.detail, title: store.title,
            departments: store.departments }])) }]));
      for (const format of ['json', 'multipart']) {
        await client.reset();
        const result = await client.save('27', data, format);
        assert.equal(result.status, 200, `${format}: ${result.text}`);
        assert.deepEqual((await client.storeRecords())[26], savedRecord(recordFixture()[26], complete),
          `${format}: absent members are stored as empty values in member order`);
      }
      // An absent required value is empty, so the validator reports it.
      const unnamed = edited('27', 'unnamed');
      Object.values(unnamed.companies)[0].stores.__00000000000ad__ = { enabled: '1' };
      const result = await client.save('27', unnamed, 'json');
      assert.equal(result.status, 422, result.text);
    },
  },
  ...['json', 'multipart'].map(format => ({
    id: `save-library-data-${format}`,
    async run(client) {
      await client.reset();
      // The submission is what the library itself produces: the stored record loaded into a form
      // instance, a company (with its initial store and department) added with the row operation
      // and two names typed. JSON sends getData(), which leaves out the untouched fields of the new
      // rows; the native form sends what a browser submits from the rendered form.
      const record = recordFixture()[28];
      const form = createForm(compileForm(recordSpecs().form, { keyPrefix: 'form' }), formData(record), { language: 'ko' });
      const companyKey = '__00000000000c1__';
      form.addRow('companies', { key: companyKey });
      const storeKey = Object.keys(form.getData().companies[companyKey].stores)[0];
      form.setValue(`companies.${companyKey}.name`, 'Library company');
      form.setValue(`companies.${companyKey}.stores.${storeKey}.name`, 'Library store');
      const data = form.getData();
      const store = data.companies[companyKey].stores[storeKey];
      assert.equal(store.detail, undefined, 'the library leaves out an untouched field of a new row');
      const request = format === 'json' ? submission(data, 'json') : { body: browserFields(renderForm(form)) };
      const result = await client.request('POST', '/api/records/29', request);
      assert.equal(result.status, 200, `${format}: ${result.text}`);
      const saved = (await client.storeRecords())[28];
      assert.deepEqual(saved.companies[companyKey], {
        name: 'Library company',
        stores: { [storeKey]: {
          name: 'Library store', enabled: store.enabled ?? '', detail: '', title: { ko: '', en: '' },
          departments: Object.fromEntries(Object.keys(store.departments ?? {}).map(key => [key, { name: '' }])),
        } },
      }, `${format}: the new rows are stored complete`);
    },
  })),
  {
    id: 'save-companies-validates',
    async run(client) {
      await client.reset();
      const five = edited('25', 'five');
      const row = Object.values(five.companies)[0];
      five.companies = Object.fromEntries(['1', '2', '3', '4', '5'].map(n =>
        [`__000000000000${n}__`, structuredClone(row)]));
      const unnamed = edited('25', 'unnamed');
      Object.values(Object.values(unnamed.companies)[0].stores)[0].name = '';
      for (const [name, data] of [['five companies', five], ['unnamed store', unnamed]]) {
        for (const format of ['multipart', 'json']) {
          await unchanged(client, async () => {
            const result = await client.save('25', data, format);
            assert.equal(result.status, 422, `${name} (${format}): ${result.text}`);
            assert.deepEqual(result.json, { validation: expectedValidation(data), server: client.server }, `${name} (${format})`);
          }, `${name} (${format}): an invalid save stores nothing`);
        }
      }
    },
  },
  {
    id: 'save-companies-rejects-shapes',
    async run(client) {
      await client.reset();
      const variant = change => { const data = edited('26', 'shape'); change(data); return data; };
      const firstStore = data => Object.values(Object.values(data.companies)[0].stores)[0];
      const cases = [
        ['company is text', variant(data => { data.companies = 'x'; }), 'json'],
        ['row key is not a row key', variant(data => { data.companies = { first: Object.values(data.companies)[0] }; }), 'json'],
        ['store has another member', variant(data => { firstStore(data).extra = 'x'; }), 'json'],
        ['enabled is not a checkbox value', variant(data => { firstStore(data).enabled = 'yes'; }), 'multipart'],
        ['title language is missing', variant(data => { firstStore(data).title = { ko: 'x' }; }), 'json'],
        ['department name is a number', variant(data => { firstStore(data).departments = { __0000000000001__: { name: 1 } }; }), 'json'],
      ];
      for (const [name, data, format] of cases) {
        await unchanged(client, async () => {
          const result = await client.save('26', data, format);
          assert.equal(result.status, 400, `${name}: ${result.text}`);
          assert.equal(typeof result.json?.error, 'string', `${name}: error message`);
        }, `${name}: the store is unchanged`);
      }
    },
  },
  {
    id: 'save-invalid-keeps-the-store',
    async run(client) {
      await client.reset();
      for (const format of ['multipart', 'urlencoded', 'json']) {
        const data = { ...edited('22', format), name: '', status: 'unknown', joined: '2027-13-40', score: 'many' };
        await unchanged(client, async () => {
          const result = await client.save('22', data, format);
          assert.equal(result.status, 422, `${format}: ${result.text}`);
          assert.deepEqual(result.json, { validation: expectedValidation(data), server: client.server }, format);
        }, `${format}: an invalid save stores nothing`);
      }
      for (const score of ['-1', '1e20']) {
        const outside = { ...edited('22', 'outside'), score };
        const result = await client.save('22', outside, 'multipart');
        assert.equal(result.status, 422, `score ${score}: ${result.text}`);
        assert.deepEqual(result.json.validation, expectedValidation(outside), `score ${score}`);
      }
    },
  },
  {
    id: 'save-rejects-requests',
    async run(client) {
      await client.reset();
      const data = edited('22', 'rejected');
      const cases = [
        ['unknown record', '46', submission({ ...data, id: '46' }, 'multipart'), 404],
        ['different id', '22', submission({ ...data, id: '23' }, 'multipart'), 400],
        ['incomplete native form', '22', { body: nativeFields(data, 'multipart', { complete: false }) }, 400],
        ['unknown member', '22', submission({ ...data, extra: 'x' }, 'urlencoded'), 400],
        ['missing id', '22', submission({ ...data, id: undefined }, 'json'), 400],
        ['number member', '22', { body: JSON.stringify({ form: { ...data, score: 9021.25 } }), headers: { 'Content-Type': 'application/json' } }, 400],
        ['nested text member', '22', submission({ ...data, name: { ko: 'x' } }, 'json'), 400],
        ['malformed JSON', '22', { body: '{"form":', headers: { 'Content-Type': 'application/json' } }, 400],
        ['additional native field', '22', { body: (() => { const fields = nativeFields(data, 'urlencoded'); fields.append('other', 'x'); return fields; })() }, 400],
        ['repeated native field', '22', { body: (() => { const fields = nativeFields(data, 'urlencoded'); fields.append('form[name]', 'again'); return fields; })() }, 400],
        ['repeated multipart field', '22', { body: (() => { const fields = nativeFields(data, 'multipart'); fields.append('form[name]', 'again'); return fields; })() }, 400],
        ['additional JSON member', '22', { body: JSON.stringify({ form: data, other: 1 }), headers: { 'Content-Type': 'application/json' } }, 400],
        ['text request', '22', { body: 'name=x', headers: { 'Content-Type': 'text/plain' } }, 415],
        ['oversized request', '22', submission({ ...data, markup: 'x'.repeat(2 * 1024 * 1024) }, 'urlencoded'), 413],
      ];
      for (const [name, id, request, status] of cases) {
        await unchanged(client, async () => {
          const result = await client.request('POST', `/api/records/${id}`, request);
          assert.equal(result.status, status, `${name}: ${result.text}`);
          assert.equal(typeof result.json?.error, 'string', `${name}: error message`);
        }, `${name}: the store is unchanged`);
      }
      assert.equal((await client.request('PUT', '/api/records/22', submission(data, 'json'))).status, 405);
    },
  },
  {
    id: 'save-stops-reading-an-oversized-request',
    async run(client) {
      await client.reset();
      // The request declares 64 MiB and sends one byte over the 2 MiB limit; the rest never comes.
      await unchanged(client, async () => {
        const result = await client.unfinishedRequest('POST', '/api/records/22', {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          declaredBytes: 64 * 1024 * 1024, sentBytes: 2 * 1024 * 1024 + 1,
        });
        assert.equal(result.status, 413, result.text);
        assert.equal(typeof result.json?.error, 'string', 'error message');
        assert.equal(result.json.server, client.server, 'the response names the responding server');
        // Measured at milliseconds; a server that waits for the rest answers only at its request timeout.
        assert.ok(result.elapsedMs < 5_000, `answered after ${Math.round(result.elapsedMs)} ms`);
      }, 'an oversized save stores nothing');
    },
  },
  {
    id: 'malformed-store-fails-and-is-kept',
    async run(client) {
      const record = recordFixture()[0];
      const { companies, ...withoutCompanies } = record;
      const store = records => JSON.stringify(records);
      const malformed = [
        ['not JSON', 'not json'],
        ['not a record list', '{}'],
        ['a record without companies', store([withoutCompanies, ...recordFixture().slice(1)])],
        ['a record with another member', store([{ ...record, extra: 'x' }, ...recordFixture().slice(1)])],
        ['a company row key that is not a row key', store([{ ...record, companies: { first: Object.values(companies)[0] } }, ...recordFixture().slice(1)])],
      ];
      for (const [name, bytes] of malformed) {
        await client.reset();
        await client.writeStore(bytes);
        for (const [method, target, request] of [
          ['GET', '/api/records?page=1'], ['GET', '/api/records/1'],
          ['POST', '/api/records/1', submission(edited('1', 'malformed'), 'json')],
        ]) {
          const result = await client.request(method, target, request);
          assert.equal(result.status, 500, `${name}: ${method} ${target}: ${result.text}`);
          assert.equal(typeof result.json?.error, 'string', `${name}: error message`);
        }
        assert.equal(String(await client.storeBytes()), bytes, `${name}: the store file is kept`);
      }
      await client.reset();
      assert.deepEqual(await client.storeRecords(), recordFixture(), 'reset replaces a malformed store');
    },
  },
  {
    id: 'reset-restores-the-fixture',
    async run(client) {
      await client.reset();
      assert.equal((await client.save('7', edited('7', 'before reset'), 'multipart')).status, 200);
      await client.reset();
      assert.deepEqual(await client.storeRecords(), recordFixture());
      assert.deepEqual((await client.request('GET', '/api/records/7')).json.record, recordFixture()[6]);
      const body = await client.request('POST', '/api/records/reset', { body: 'x', headers: { 'Content-Type': 'text/plain' } });
      assert.equal(body.status, 400, 'reset takes no body');
    },
  },
  {
    id: 'saved-values-survive-a-restart',
    async run(client) {
      await client.reset();
      const data = edited('41', 'restart');
      assert.equal((await client.save('41', data, 'multipart')).status, 200);
      await client.restart();
      const expected = savedRecord(recordFixture()[40], data);
      assert.deepEqual((await client.request('GET', '/api/records/41')).json.record, expected);
      assert.deepEqual((await client.request('GET', '/api/records?page=3')).json.records[0], expected);
    },
  },
  ...recordViews.map(view => ({
    id: `view-${view}`,
    async run(client) {
      await client.reset();
      const data = edited('22', view);
      assert.equal((await client.save('22', data, 'multipart')).status, 200);
      const records = recordFixture();
      records[21] = savedRecord(records[21], data);
      for (const [lang, framework, mode] of [['en', 'vue', 'createForm'], ['ko', 'react', 'bindForm']]) {
        const selection = { lang, server: client.server, framework, initialization: 'ssr', mode, page: 2 };
        const query = `${view === 'list' ? '' : 'id=22&'}${selectionQuery(selection)}`;
        const result = await client.request('GET', `/api/records/view/${view}?${query}`);
        assert.equal(result.status, 200, `${view} ${lang}: ${result.text}`);
        assert.equal(result.cacheControl, 'no-store');
        assert.deepEqual(Object.keys(result.json).sort(), ['data', 'html', 'server', 'view']);
        assert.equal(result.json.view, view);
        assert.equal(result.json.html, expectedStageHtml(view, selection, { records, record: records[21] }),
          `${view} ${lang}: the stage HTML of the shared renderers`);
        assert.deepEqual(result.json.data, view === 'list'
          ? { page: 2, perPage: 20, total: 45, records: pageRecords(records, 2) }
          : { record: records[21] }, `${view} ${lang}: the stage data`);
      }
    },
  })),
  {
    id: 'view-rejects-queries',
    async run(client) {
      await client.reset();
      const base = { lang: 'en', server: client.server, framework: 'html', initialization: 'ssr', mode: 'bindForm', page: 1 };
      const query = overrides => selectionQuery({ ...base, ...overrides });
      const rejected = [
        ['list', query({ server: client.server === 'go' ? 'rust' : 'go' }), 400],
        ['list', query({ initialization: 'csr' }), 400],
        ['list', query({ lang: 'fr' }), 400],
        ['list', query({ framework: 'angular' }), 400],
        ['list', query({ mode: 'form' }), 400],
        ['list', `${query()}&saved=1`, 400],
        ['list', `${query()}&lang=en`, 400],
        ['list', query().replace('&mode=bindForm', ''), 400],
        ['detail', query(), 400],
        ['form', `id=x&${query()}`, 400],
        ['list', query({ page: 4 }), 404],
        ['detail', `id=46&${query()}`, 404],
        ['form', `id=46&${query()}`, 404],
        ['table', query(), 404],
        ['%6Cist', query(), 404],
      ];
      for (const [view, search, status] of rejected) {
        const result = await client.request('GET', `/api/records/view/${view}?${search}`);
        assert.equal(result.status, status, `${view}?${search}: ${result.text}`);
        assert.equal(typeof result.json?.error, 'string', `${view}?${search}: error message`);
      }
    },
  },
]);
