// The JavaScript record server (docs/spec/form-comparison.md, "Record resource"): one persistent
// store of the customer records, its HTTP contract and the SSR stage views, rendered with the
// JavaScript generators and checked with the JavaScript validator. The public server answers
// `/api/js/records…` with this module and `servers/javascript/main.mjs` serves it on its own.
import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compileForm, createForm } from '@crudui/generator-core';
import { renderDetail, renderForm, renderList } from '@crudui/generator-html';
import { FormInputError, validate } from '@crudui/validator';

import {
  formData, linkedSpecs, recordClients, recordLanguages, recordModes, recordsPerPage, recordViews,
} from '../../src/record-view.mjs';

const bodyLimit = 2 * 1024 * 1024;
const positiveInteger = /^[1-9][0-9]*$/;
const formMembers = ['id', 'name', 'status', 'joined', 'score', 'relation', 'markup'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sameMembers = (value, members) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === members.length && members.every(member => Object.hasOwn(value, member));

/** Require the exact submitted object: the form members, `relation` with `name`, all text. */
function submittedForm(form) {
  if (!sameMembers(form, formMembers) || !sameMembers(form.relation, ['name'])) {
    throw new HttpError(400, 'Expected the form members id, name, status, joined, score, relation.name and markup');
  }
  for (const value of [...formMembers.filter(member => member !== 'relation').map(member => form[member]), form.relation.name]) {
    if (typeof value !== 'string') throw new HttpError(400, 'Every form member must be text');
  }
  return form;
}

/** The submitted object of native fields `form[…]` with `_form_complete=1`. */
function nativeForm(fields) {
  const form = {};
  let complete = 0;
  for (const [name, value] of fields) {
    if (typeof value !== 'string') throw new HttpError(400, `Field ${name} must be text`);
    if (name === '_form_complete') {
      if (value !== '1' || ++complete > 1) throw new HttpError(400, 'Expected one _form_complete=1');
      continue;
    }
    const match = /^form\[([^[\]]+)\](?:\[([^[\]]+)\])?$/.exec(name);
    if (!match) throw new HttpError(400, `Unknown field ${name}`);
    const [, member, child] = match;
    if (child === undefined) {
      if (Object.hasOwn(form, member)) throw new HttpError(400, `Repeated field ${name}`);
      form[member] = value;
    } else {
      if (Object.hasOwn(form, member) && (typeof form[member] !== 'object' || Object.hasOwn(form[member], child))) {
        throw new HttpError(400, `Repeated field ${name}`);
      }
      form[member] ??= {};
      form[member][child] = value;
    }
  }
  if (complete !== 1) throw new HttpError(400, 'The form submission is incomplete');
  return form;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= bodyLimit) chunks.push(chunk);
  }
  return { size, bytes: Buffer.concat(chunks) };
}

/** Parse one save request as the rendered form or as JSON posts it. */
async function parseSubmission(request, body) {
  if (body.size > bodyLimit) throw new HttpError(413, 'Request exceeds 2 MiB');
  const type = (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    let value;
    try {
      value = JSON.parse(body.bytes.toString('utf8'));
    } catch {
      throw new HttpError(400, 'Malformed JSON');
    }
    if (!sameMembers(value, ['form'])) throw new HttpError(400, 'Expected { "form": { … } }');
    return submittedForm(value.form);
  }
  if (type !== 'multipart/form-data' && type !== 'application/x-www-form-urlencoded') {
    throw new HttpError(415, 'Expected multipart/form-data, application/x-www-form-urlencoded or application/json');
  }
  let fields;
  try {
    fields = await new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': request.headers['content-type'] }, body: body.bytes,
    }).formData();
  } catch {
    throw new HttpError(400, 'Malformed form request');
  }
  return submittedForm(nativeForm(fields));
}

/** Parse a view query: `id` first for detail and form, then the selection, each exactly once. */
function viewSelection(view, search, server) {
  const entries = [...new URLSearchParams(search)];
  const expected = [...(view === 'list' ? [] : ['id']), 'lang', 'server', 'framework', 'initialization', 'mode', 'page'];
  if (entries.length !== expected.length || entries.some(([key], index) => key !== expected[index])) {
    throw new HttpError(400, `Expected the query ${expected.join(', ')}`);
  }
  const query = Object.fromEntries(entries);
  if (!recordLanguages.includes(query.lang) || query.server !== server || !recordClients.includes(query.framework)
      || query.initialization !== 'ssr' || !recordModes.includes(query.mode) || !positiveInteger.test(query.page)
      || (view !== 'list' && !positiveInteger.test(query.id))) {
    throw new HttpError(400, 'Invalid view query');
  }
  return { id: query.id, selection: { ...query, id: undefined, page: Number(query.page) } };
}

/**
 * The record store of one server in `dataDirectory`, reading the published fixture and
 * specifications from `publicDirectory`. Writes run one at a time and replace the file atomically.
 */
export function recordStore({ server = 'js', dataDirectory, publicDirectory }) {
  const storeFile = path.join(dataDirectory, `records-${server}.json`);
  const readPublished = async name => JSON.parse(await readFile(path.join(publicDirectory, name), 'utf8'));
  let queue = Promise.resolve();

  /** Run `task` after every earlier store operation of this process. */
  function exclusive(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  async function write(records) {
    const temporary = path.join(dataDirectory, `.records-${server}-${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(records, null, 2) + '\n');
      await rename(temporary, storeFile);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async function read() {
    let text;
    try {
      text = await readFile(storeFile, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const records = await readPublished('customer-records.json');
      await write(records);
      return records;
    }
    const records = JSON.parse(text);
    if (!Array.isArray(records)) throw new Error(`${storeFile} does not hold a records array`);
    return records;
  }

  const records = () => exclusive(read);
  const lastPage = total => Math.max(1, Math.ceil(total / recordsPerPage));
  const pageData = (stored, page) => {
    if (page > lastPage(stored.length)) throw new HttpError(404, 'Page not found');
    return {
      page, perPage: recordsPerPage, total: stored.length,
      records: stored.slice((page - 1) * recordsPerPage, page * recordsPerPage),
    };
  };
  const findRecord = (stored, id) => {
    const record = stored.find(item => item.id === id);
    if (!record) throw new HttpError(404, 'Record not found');
    return record;
  };

  /** One page of records, or a 404 failure beyond the last page. */
  async function list(page) {
    return pageData(await records(), page);
  }

  /** One stored record, or a 404 failure. */
  async function record(id) {
    return { record: findRecord(await records(), id) };
  }

  /** The SSR stage of one view for a view query string. */
  async function view(name, search) {
    if (!recordViews.includes(name)) throw new HttpError(404, 'Unknown view');
    const { id, selection } = viewSelection(name, search, server);
    const [stored, published] = await Promise.all([records(), readPublished('customer-specs.json')]);
    const specs = linkedSpecs(published, selection);
    const language = selection.lang;
    if (name === 'list') {
      const data = pageData(stored, selection.page);
      const html = renderList(specs.list, data.records, { language, layout: 'table', page: data.page, total: data.total });
      return { view: name, html, data };
    }
    const item = findRecord(stored, id);
    if (name === 'detail') {
      return { view: name, html: renderDetail(specs.detail, item, { language }), data: { record: item } };
    }
    const template = compileForm(specs.form, { keyPrefix: 'form' });
    const form = renderForm(createForm(template, formData(item), { language }));
    const html = `<form id="record-form" method="post" action="/api/${server}/records/${item.id}" `
      + `enctype="multipart/form-data">${form}</form>`;
    return { view: name, html, data: { record: item } };
  }

  async function save(id, request) {
    const body = await readBody(request);
    const specs = await readPublished('customer-specs.json');
    return exclusive(async () => {
      const stored = await read();
      const index = stored.findIndex(item => item.id === id);
      if (index < 0) throw new HttpError(404, 'Record not found');
      const form = await parseSubmission(request, body);
      if (form.id !== id) throw new HttpError(400, 'The submitted id differs from the record id');
      let validation;
      try {
        validation = validate(specs.form, form);
      } catch (error) {
        if (error instanceof FormInputError) throw new HttpError(400, error.message);
        throw error;
      }
      if (!validation.valid) return { status: 422, body: { validation } };
      const previous = stored[index];
      const saved = {};
      for (const [member, value] of Object.entries(previous)) {
        saved[member] = member === 'id' || member === 'avatar' ? value
          : member === 'score' ? Number(form.score)
            : member === 'relation' ? { name: form.relation.name } : form[member];
      }
      stored[index] = saved;
      await write(stored);
      return { status: 200, body: { record: saved, validation: { valid: true, errors: [] } } };
    });
  }

  async function reset(request) {
    const body = await readBody(request);
    if (body.size > 0) throw new HttpError(400, 'A reset takes no request body');
    const fixture = await readPublished('customer-records.json');
    await exclusive(() => write(fixture));
    return { total: fixture.length };
  }

  /** Route one request on the server's own paths (`/api/records…`). */
  async function route(method, pathname, search, request) {
    const allow = allowed => {
      if (!allowed.includes(method)) throw new HttpError(405, 'Method not allowed');
    };
    if (pathname === '/api/records') {
      allow(['GET']);
      const entries = [...new URLSearchParams(search)];
      if (entries.length !== 1 || entries[0][0] !== 'page' || !positiveInteger.test(entries[0][1])) {
        throw new HttpError(400, 'Expected one page parameter');
      }
      return { status: 200, body: await list(Number(entries[0][1])) };
    }
    if (pathname === '/api/records/reset') {
      allow(['POST']);
      return { status: 200, body: await reset(request) };
    }
    const viewMatch = /^\/api\/records\/view\/([^/]+)$/.exec(pathname);
    if (viewMatch) {
      allow(['GET']);
      return { status: 200, body: await view(viewMatch[1], search) };
    }
    const idMatch = /^\/api\/records\/([^/]+)$/.exec(pathname);
    if (idMatch) {
      allow(['GET', 'POST']);
      if (method === 'POST') return save(idMatch[1], request);
      return { status: 200, body: await record(idMatch[1]) };
    }
    throw new HttpError(404, 'Unknown endpoint');
  }

  /**
   * Answer one request whose path is already relative to the server (`/api/records…`). Every
   * response is JSON that names this server.
   */
  async function handle(request, response, pathname, search) {
    let result;
    try {
      result = await route(request.method, pathname, search, request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      result = { status, body: { error: error.message } };
    }
    if (!request.complete) request.resume();
    response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ...result.body, server }));
  }

  /**
   * Call one read of the store in process, with the status the HTTP contract gives it:
   * `list(page)`, `record(id)` or `view(name, search)`.
   */
  async function call(action, ...args) {
    try {
      return { status: 200, json: { ...await ({ list, record, view })[action](...args), server } };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return { status: error.status, json: { error: error.message, server } };
    }
  }

  return { handle, call };
}
